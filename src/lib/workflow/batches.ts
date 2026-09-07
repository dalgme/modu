import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { queueNotification } from '@/lib/workflow/notifications';
import { notifyProgramStaff } from '@/lib/workflow/closure';
import { TRANSITIONS } from '@/lib/workflow/transitions';
import { sumSettlements } from '@/lib/settlement/compute';
import { mentorsMissingPaymentDocs } from '@/lib/data/mentors';

export type BatchResult = { ok: true; batchId: string } | { ok: false; error: string };

/** 품의 합계를 건별 스냅샷의 합으로 다시 쓴다 (재계산 없음). */
async function refreshBatchTotals(batchId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from('settlements').select('gross, withholding, net').eq('batch_id', batchId).neq('status', 'canceled');
  const t = sumSettlements((data ?? []).map((s) => ({ gross: Number(s.gross), withholding: Number(s.withholding), net: Number(s.net) })));
  await admin.from('settlement_batches').update({ total_gross: t.gross, total_withholding: t.withholding, total_net: t.net }).eq('id', batchId);
}

/** T8 지급 품의 생성(draft) + 정산 건 편성. closure 정산의 케이스는 settlement_batched 로. */
export async function createBatch(input: { programId: string; title: string; settlementIds: string[]; actorId: string; note?: string }): Promise<BatchResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: '품의 제목을 입력하세요.' };
  if (input.settlementIds.length === 0) return { ok: false, error: '편성할 정산 건을 선택하세요.' };
  const admin = createAdminClient();
  const { data: batch, error } = await admin
    .from('settlement_batches')
    .insert({ program_id: input.programId, title, status: 'draft', created_by: input.actorId, note: input.note?.trim() || null })
    .select('id')
    .single();
  if (error || !batch) return { ok: false, error: error?.message ?? '품의 생성에 실패했습니다.' };
  const added = await addToBatch(batch.id, input.settlementIds, input.actorId);
  if (!added.ok) {
    await admin.from('settlement_batches').delete().eq('id', batch.id);
    return added;
  }
  await admin.from('audit_logs').insert({ actor_id: input.actorId, program_id: input.programId, action: 'batch.created', entity_type: 'settlement_batches', entity_id: batch.id, metadata: { title, count: input.settlementIds.length } });
  return { ok: true, batchId: batch.id };
}

/** T8 정산 건을 draft 품의에 추가 */
export async function addToBatch(batchId: string, settlementIds: string[], actorId: string): Promise<BatchResult> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, program_id, status').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  if (batch.status !== 'draft') return { ok: false, error: '작성 중(draft) 품의에만 편성할 수 있습니다.' };
  const ids = Array.from(new Set(settlementIds));
  const { data: items } = await admin.from('settlements').select('id, case_id, kind, status, batch_id, program_id').in('id', ids);
  const rows = items ?? [];
  if (rows.length !== ids.length) return { ok: false, error: '존재하지 않는 정산 건이 포함되어 있습니다.' };
  for (const s of rows) {
    if (s.program_id !== batch.program_id) return { ok: false, error: '다른 행사의 정산 건은 편성할 수 없습니다.' };
    if (s.status !== 'pending' || s.batch_id) return { ok: false, error: TRANSITIONS.add_to_batch.denied };
  }
  // 종결 게이트: 멘토 지급서류 미수령 시 품의 차단 (설정, 기본 꺼짐)
  const { data: program } = await admin.from('programs').select('closure_policy').eq('id', batch.program_id).maybeSingle();
  const policy = (program?.closure_policy ?? {}) as { block_batch_on_missing_mentor_docs?: boolean };
  if (policy.block_batch_on_missing_mentor_docs) {
    const { data: mentorRows } = await admin.from('settlements').select('mentor_id').in('id', ids);
    const missing = await mentorsMissingPaymentDocs(batch.program_id, Array.from(new Set((mentorRows ?? []).map((m) => m.mentor_id))));
    if (missing.size > 0) {
      const { data: names } = await admin.from('users').select('name').in('id', Array.from(missing));
      return { ok: false, error: `지급서류(이력서·통장사본·신분증사본) 미수령 멘토가 있어 편성할 수 없습니다: ${(names ?? []).map((n) => n.name).join(', ')} — 멘토 명단에서 수령 체크 후 다시 시도하세요.` };
    }
  }
  const now = new Date().toISOString();
  const { data: upd } = await admin.from('settlements').update({ status: 'batched', batch_id: batchId }).in('id', ids).eq('status', 'pending').is('batch_id', null).select('id, case_id, kind');
  if (!upd || upd.length !== ids.length) {
    // 부분 성공 롤백
    await admin.from('settlements').update({ status: 'pending', batch_id: null }).eq('batch_id', batchId).in('id', ids);
    return { ok: false, error: '일부 정산 건이 이미 편성되었습니다. 새로고침 후 다시 시도하세요.' };
  }
  for (const s of upd) {
    if (s.kind !== 'closure') continue;
    const { data: c } = await admin.from('cases').update({ status: 'settlement_batched' }).eq('id', s.case_id).in('status', [...TRANSITIONS.add_to_batch.from]).select('id');
    if (c && c.length > 0) {
      await admin.from('case_status_history').insert({ case_id: s.case_id, from_status: 'settlement_pending', to_status: 'settlement_batched', changed_by: actorId, note: '지급 품의 편성', created_at: now });
    }
  }
  await refreshBatchTotals(batchId);
  return { ok: true, batchId };
}

/** T8' draft 품의에서 정산 건 제외 */
export async function removeFromBatch(batchId: string, settlementId: string, actorId: string): Promise<BatchResult> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  if (batch.status !== 'draft') return { ok: false, error: TRANSITIONS.remove_from_batch.denied };
  const { data: upd } = await admin.from('settlements').update({ status: 'pending', batch_id: null }).eq('id', settlementId).eq('batch_id', batchId).eq('status', 'batched').select('id, case_id, kind');
  if (!upd || upd.length === 0) return { ok: false, error: '이 품의에 편성된 정산 건이 아닙니다.' };
  const s = upd[0]!;
  if (s.kind === 'closure') {
    const { data: c } = await admin.from('cases').update({ status: 'settlement_pending' }).eq('id', s.case_id).in('status', [...TRANSITIONS.remove_from_batch.from]).select('id');
    if (c && c.length > 0) await admin.from('case_status_history').insert({ case_id: s.case_id, from_status: 'settlement_batched', to_status: 'settlement_pending', changed_by: actorId, note: '지급 품의에서 제외' });
  }
  await refreshBatchTotals(batchId);
  return { ok: true, batchId };
}

/** draft 품의 삭제 (편성 건은 전부 pending 으로 복귀) */
export async function deleteDraftBatch(batchId: string, actorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status, program_id').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  if (batch.status !== 'draft') return { ok: false, error: '작성 중 품의만 삭제할 수 있습니다.' };
  const { data: items } = await admin.from('settlements').select('id').eq('batch_id', batchId);
  for (const s of items ?? []) {
    const r = await removeFromBatch(batchId, s.id, actorId);
    if (!r.ok) return r;
  }
  await admin.from('settlement_batches').delete().eq('id', batchId).eq('status', 'draft');
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: batch.program_id, action: 'batch.deleted', entity_type: 'settlement_batches', entity_id: batchId, metadata: null });
  return { ok: true };
}

/** 품의 제출 (draft → submitted) — 발주처에 알림 */
export async function submitBatch(batchId: string, actorId: string): Promise<BatchResult> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status, program_id, title').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  if (batch.status !== 'draft') return { ok: false, error: '작성 중 품의만 제출할 수 있습니다.' };
  const { count } = await admin.from('settlements').select('id', { count: 'exact', head: true }).eq('batch_id', batchId).eq('status', 'batched');
  if ((count ?? 0) === 0) return { ok: false, error: '편성된 정산 건이 없습니다.' };
  await refreshBatchTotals(batchId);
  const { data: upd } = await admin.from('settlement_batches').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', batchId).eq('status', 'draft').select('id');
  if (!upd || upd.length === 0) return { ok: false, error: '이미 제출된 품의입니다.' };
  await notifyProgramStaff(batch.program_id, null, 'batch_submitted', ['institution']);
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: batch.program_id, action: 'batch.submitted', entity_type: 'settlement_batches', entity_id: batchId, metadata: { title: batch.title, count } });
  return { ok: true, batchId };
}

/** 제출 철회 (submitted → draft) — 발주처 확인 전까지만 */
export async function unsubmitBatch(batchId: string, actorId: string): Promise<BatchResult> {
  const admin = createAdminClient();
  const { data: upd } = await admin.from('settlement_batches').update({ status: 'draft', submitted_at: null }).eq('id', batchId).eq('status', 'submitted').select('id, program_id');
  if (!upd || upd.length === 0) return { ok: false, error: '제출 상태의 품의만 철회할 수 있습니다.' };
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: upd[0]!.program_id, action: 'batch.unsubmitted', entity_type: 'settlement_batches', entity_id: batchId, metadata: null });
  return { ok: true, batchId };
}

/**
 * T9 발주처 '정산 확인' (submitted → confirmed).
 * 포함된 closure 정산의 케이스는 closed, partial 은 정산 건만 confirmed. 멘토·멘티 알림.
 */
export async function confirmBatch(batchId: string, actorId: string): Promise<BatchResult> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status, program_id, title').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  if (batch.status !== 'submitted') return { ok: false, error: '제출된 품의만 정산 확인할 수 있습니다.' };
  const now = new Date().toISOString();
  const { data: upd } = await admin.from('settlement_batches').update({ status: 'confirmed', confirmed_by: actorId, confirmed_at: now }).eq('id', batchId).eq('status', 'submitted').select('id');
  if (!upd || upd.length === 0) return { ok: false, error: '이미 처리된 품의입니다.' };

  const { data: items } = await admin.from('settlements').select('id, case_id, kind, mentor_id').eq('batch_id', batchId).eq('status', 'batched');
  await admin.from('settlements').update({ status: 'confirmed' }).eq('batch_id', batchId).eq('status', 'batched');
  for (const s of items ?? []) {
    if (s.kind !== 'closure') continue;
    const { data: c } = await admin
      .from('cases')
      .update({ status: 'closed', closed_at: now })
      .eq('id', s.case_id)
      .in('status', [...TRANSITIONS.confirm_settlement.from])
      .select('id, mentee_id, program_id');
    if (!c || c.length === 0) continue;
    const row = c[0]!;
    await admin.from('case_status_history').insert({ case_id: s.case_id, from_status: 'settlement_batched', to_status: 'closed', changed_by: actorId, note: `정산 확인 · 종결 (${batch.title})` });
    await admin.from('mentor_assignments').update({ is_active: false, ended_at: now, ended_by: actorId, end_kind: 'case_closed' }).eq('case_id', s.case_id).eq('is_active', true);
    await queueNotification(admin, { caseId: s.case_id, programId: row.program_id, recipientId: s.mentor_id, triggerEvent: 'case_closed' });
    if (row.mentee_id) {
      await queueNotification(admin, { caseId: s.case_id, programId: row.program_id, recipientId: row.mentee_id, triggerEvent: 'case_closed' });
      const { count } = await admin.from('survey_responses').select('id', { count: 'exact', head: true }).eq('case_id', s.case_id);
      if ((count ?? 0) === 0) await queueNotification(admin, { caseId: s.case_id, programId: row.program_id, recipientId: row.mentee_id, triggerEvent: 'survey_reminder' });
    }
  }
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: batch.program_id, action: 'batch.confirmed', entity_type: 'settlement_batches', entity_id: batchId, metadata: { title: batch.title, count: (items ?? []).length } });
  return { ok: true, batchId };
}

/** 지급 완료 표시 (confirmed → paid, 운영사) */
export async function markBatchPaid(batchId: string, actorId: string, paidAt?: string): Promise<BatchResult> {
  const admin = createAdminClient();
  const at = paidAt ?? new Date().toISOString();
  const { data: upd } = await admin.from('settlement_batches').update({ status: 'paid', paid_at: at }).eq('id', batchId).eq('status', 'confirmed').select('id, program_id, title');
  if (!upd || upd.length === 0) return { ok: false, error: '발주처가 확인한 품의만 지급 완료로 표시할 수 있습니다.' };
  await admin.from('settlements').update({ status: 'paid', paid_at: at }).eq('batch_id', batchId).eq('status', 'confirmed');
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: upd[0]!.program_id, action: 'batch.paid', entity_type: 'settlement_batches', entity_id: batchId, metadata: { title: upd[0]!.title, paid_at: at } });
  return { ok: true, batchId };
}
