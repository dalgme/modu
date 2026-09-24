import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { queueNotification } from '@/lib/workflow/notifications';
import { notifyProgramStaff } from '@/lib/workflow/closure';
import { assertBatchTransition, BATCH_TRANSITIONS, TRANSITIONS } from '@/lib/workflow/transitions';
import { recomputeFromLines, sumSettlements, type SettlementLine, type WithholdingPolicy } from '@/lib/settlement/compute';
import { mentorsMissingPaymentDocs } from '@/lib/data/mentors';
import type { Json } from '@/types/database';

export type BatchResult = { ok: true; batchId: string } | { ok: false; error: string };

type Totals = { gross: number; withholding: number; net: number };

/** 품의 합계를 건별 스냅샷의 합으로 다시 쓴다 (재계산 없음). 감사 메타데이터용으로 합계·건 id 를 돌려준다. */
async function refreshBatchTotals(batchId: string): Promise<Totals & { settlementIds: string[] }> {
  const admin = createAdminClient();
  const { data } = await admin.from('settlements').select('id, gross, withholding, net').eq('batch_id', batchId).neq('status', 'canceled');
  const rows = data ?? [];
  const t = sumSettlements(rows.map((s) => ({ gross: Number(s.gross), withholding: Number(s.withholding), net: Number(s.net) })));
  await admin.from('settlement_batches').update({ total_gross: t.gross, total_withholding: t.withholding, total_net: t.net }).eq('id', batchId);
  return { ...t, settlementIds: rows.map((r) => r.id) };
}

async function audit(actorId: string, programId: string, action: string, entityId: string, metadata: Json, entityType = 'settlement_batches'): Promise<void> {
  const { error } = await createAdminClient().from('audit_logs').insert({ actor_id: actorId, program_id: programId, action, entity_type: entityType, entity_id: entityId, metadata });
  if (error) console.error(`[batches] audit insert failed (${action}):`, error.message);
}

/**
 * (P31) 케이스의 "열린" 정산(pending·batched)이 하나도 남지 않았는지 — 종결 판정 공용.
 * 정산 종류(closure/partial)와 무관하게 **모든** 열린 정산이 확인돼야 케이스가 종결된다.
 */
async function hasOpenSettlements(caseId: string, exceptBatchId?: string): Promise<boolean> {
  const admin = createAdminClient();
  let q = admin.from('settlements').select('id', { count: 'exact', head: true }).eq('case_id', caseId).in('status', ['pending', 'batched']);
  if (exceptBatchId) q = q.neq('batch_id', exceptBatchId);
  const { count } = await q;
  return (count ?? 0) > 0;
}

/** T8 지급 품의 생성(draft) + 정산 건 편성. */
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
  await audit(input.actorId, input.programId, 'batch.created', batch.id, { title, count: input.settlementIds.length });
  return { ok: true, batchId: batch.id };
}

/**
 * T8 정산 건을 draft 품의에 추가.
 * (P31) 케이스는 그 케이스의 **모든** 지급 대기(pending) 정산이 편성됐을 때 settlement_batched 로 옮긴다 — closure 뿐 아니라 partial 도 같은 규칙.
 */
export async function addToBatch(batchId: string, settlementIds: string[], actorId: string): Promise<BatchResult> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, program_id, status').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  { const denied = assertBatchTransition('add_item', batch.status); if (denied) return { ok: false, error: denied }; }
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
      return { ok: false, error: `지급서류(이력서·통장사본·신분증사본) 미수령 멘토가 있어 편성할 수 없습니다: ${(names ?? []).map((n) => n.name).join(', ')} — 회원 명단 › 멘토 매칭 리스트의 [지급서류]에서 O 로 바꾼 뒤 다시 시도하세요.` };
    }
  }
  const now = new Date().toISOString();
  const { data: upd } = await admin.from('settlements').update({ status: 'batched', batch_id: batchId }).in('id', ids).eq('status', 'pending').is('batch_id', null).select('id, case_id, kind, net, mentor_id');
  if (!upd || upd.length !== ids.length) {
    // 부분 성공 롤백
    await admin.from('settlements').update({ status: 'pending', batch_id: null }).eq('batch_id', batchId).in('id', ids);
    return { ok: false, error: '일부 정산 건이 이미 편성되었습니다. 새로고침 후 다시 시도하세요.' };
  }
  for (const s of upd) {
    await audit(actorId, batch.program_id, 'batch.item_added', batchId, { settlement_id: s.id, case_id: s.case_id, mentor_id: s.mentor_id, kind: s.kind, net: Number(s.net) });
  }
  const caseIds = Array.from(new Set(upd.map((s) => s.case_id)));
  for (const caseId of caseIds) {
    const { count: stillPending } = await admin.from('settlements').select('id', { count: 'exact', head: true }).eq('case_id', caseId).eq('status', 'pending');
    if ((stillPending ?? 0) > 0) continue;
    const { data: c } = await admin.from('cases').update({ status: 'settlement_batched' }).eq('id', caseId).in('status', [...TRANSITIONS.add_to_batch.from]).select('id');
    if (c && c.length > 0) {
      await admin.from('case_status_history').insert({ case_id: caseId, from_status: 'settlement_pending', to_status: 'settlement_batched', changed_by: actorId, note: '지급 품의 편성', created_at: now });
    }
  }
  await refreshBatchTotals(batchId);
  return { ok: true, batchId };
}

/** T8' draft 품의에서 정산 건 제외. 케이스가 settlement_batched 였다면 지급 대기로 되돌린다 (종류 무관, P31). */
export async function removeFromBatch(batchId: string, settlementId: string, actorId: string): Promise<BatchResult> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status, program_id').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  { const denied = assertBatchTransition('remove_item', batch.status); if (denied) return { ok: false, error: denied }; }
  const { data: upd } = await admin.from('settlements').update({ status: 'pending', batch_id: null }).eq('id', settlementId).eq('batch_id', batchId).eq('status', 'batched').select('id, case_id, kind, net, mentor_id');
  if (!upd || upd.length === 0) return { ok: false, error: '이 품의에 편성된 정산 건이 아닙니다.' };
  const s = upd[0]!;
  await audit(actorId, batch.program_id, 'batch.item_removed', batchId, { settlement_id: s.id, case_id: s.case_id, mentor_id: s.mentor_id, kind: s.kind, net: Number(s.net) });
  const { data: c } = await admin.from('cases').update({ status: 'settlement_pending' }).eq('id', s.case_id).in('status', [...TRANSITIONS.remove_from_batch.from]).select('id');
  if (c && c.length > 0) await admin.from('case_status_history').insert({ case_id: s.case_id, from_status: 'settlement_batched', to_status: 'settlement_pending', changed_by: actorId, note: '지급 품의에서 제외' });
  await refreshBatchTotals(batchId);
  return { ok: true, batchId };
}

/** draft 품의 삭제 (편성 건은 전부 pending 으로 복귀) */
export async function deleteDraftBatch(batchId: string, actorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status, program_id, title').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  { const denied = assertBatchTransition('delete', batch.status); if (denied) return { ok: false, error: denied }; }
  const { data: items } = await admin.from('settlements').select('id').eq('batch_id', batchId);
  for (const s of items ?? []) {
    const r = await removeFromBatch(batchId, s.id, actorId);
    if (!r.ok) return r;
  }
  await admin.from('settlement_batches').delete().eq('id', batchId).eq('status', 'draft');
  await audit(actorId, batch.program_id, 'batch.deleted', batchId, { title: batch.title });
  return { ok: true };
}

/** (P31) draft 품의 제목·메모 수정 */
export async function updateBatchMeta(batchId: string, actorId: string, input: { title: string; note?: string | null }): Promise<BatchResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: '품의 제목을 입력하세요.' };
  if (title.length > 120) return { ok: false, error: '제목은 120자 이내로 입력하세요.' };
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status, program_id, title, note').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  { const denied = assertBatchTransition('edit_meta', batch.status); if (denied) return { ok: false, error: denied }; }
  const note = (input.note ?? '').trim() || null;
  const { error } = await admin.from('settlement_batches').update({ title, note }).eq('id', batchId).eq('status', 'draft');
  if (error) return { ok: false, error: error.message };
  await audit(actorId, batch.program_id, 'batch.meta_updated', batchId, { before: { title: batch.title, note: batch.note }, after: { title, note } });
  return { ok: true, batchId };
}

// ───────────────────────────────────────────── 품의 단위 과세최저한 (P31)

type SnapshotPolicy = WithholdingPolicy & { source?: string; exempted?: boolean; batch_min_recomputed?: boolean; before_recompute?: { income_tax: number; local_tax: number; withholding: number; net: number; taxable: number } | null };

function policyFromSnapshot(v: unknown): SnapshotPolicy | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const p = v as Record<string, unknown>;
  const method = p.method;
  if (method === 'none') return { method: 'none', ...(p as object) } as SnapshotPolicy;
  const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : Number(p[k]));
  const rounding = p.rounding === 'floor_1' || p.rounding === 'round' ? p.rounding : 'floor_10';
  if (method === 'other_income') {
    const rates = [num('expense_rate'), num('tax_rate'), num('local_rate')];
    if (!rates.every((x) => Number.isFinite(x))) return null;
    return { ...(p as object), method, expense_rate: rates[0]!, tax_rate: rates[1]!, local_rate: rates[2]!, rounding, min_taxable_exempt: Number.isFinite(num('min_taxable_exempt')) ? num('min_taxable_exempt') : 0 } as SnapshotPolicy;
  }
  if (method === 'business_income') {
    const rates = [num('tax_rate'), num('local_rate')];
    if (!rates.every((x) => Number.isFinite(x))) return null;
    return { ...(p as object), method, tax_rate: rates[0]!, local_rate: rates[1]!, rounding } as SnapshotPolicy;
  }
  return null;
}

export interface BatchMinimumPreviewItem {
  mentorId: string;
  mentorName: string;
  /** 이 품의 안에서 합산된 기타소득금액 */
  combinedTaxable: number;
  threshold: number;
  /** 면제됐던 정산 건 (재계산 대상) */
  settlementIds: string[];
  /** 재계산으로 늘어나는 원천징수 합계 */
  extraWithholding: number;
}
export interface BatchSubmitPreview {
  ok: true;
  recompute: BatchMinimumPreviewItem[];
  totalsBefore: Totals;
  totalsAfter: Totals;
}

type BatchRow = { id: string; case_id: string; mentor_id: string; lines: Json; gross: number; taxable: number; income_tax: number; local_tax: number; withholding: number; net: number; withholding_method: string; withholding_policy: Json };

/** 같은 멘토의 여러 정산이 한 품의에 묶여 기타소득금액 합이 과세최저한을 넘는 경우를 찾아 재계산 결과를 만든다 (저장 안 함). */
async function planMinimumRecompute(batchId: string): Promise<{ items: BatchMinimumPreviewItem[]; updates: { id: string; before: BatchRow; after: { taxable: number; income_tax: number; local_tax: number; withholding: number; net: number }; policy: SnapshotPolicy }[] }> {
  const admin = createAdminClient();
  const { data } = await admin.from('settlements').select('id, case_id, mentor_id, lines, gross, taxable, income_tax, local_tax, withholding, net, withholding_method, withholding_policy').eq('batch_id', batchId).eq('status', 'batched');
  const rows = (data ?? []) as BatchRow[];
  const byMentor = new Map<string, BatchRow[]>();
  for (const r of rows) if (r.withholding_method === 'other_income') byMentor.set(r.mentor_id, [...(byMentor.get(r.mentor_id) ?? []), r]);
  const items: BatchMinimumPreviewItem[] = [];
  const updates: { id: string; before: BatchRow; after: { taxable: number; income_tax: number; local_tax: number; withholding: number; net: number }; policy: SnapshotPolicy }[] = [];
  const mentorIds = Array.from(byMentor.keys());
  const { data: users } = mentorIds.length ? await admin.from('users').select('id, name').in('id', mentorIds) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((users ?? []).map((u) => [u.id, u.name]));
  for (const [mentorId, list] of Array.from(byMentor.entries())) {
    const exempted = list.filter((r) => policyFromSnapshot(r.withholding_policy)?.exempted === true);
    if (exempted.length === 0) continue;
    const combined = list.reduce((s, r) => s + Number(r.taxable), 0);
    // 최저한은 각 건의 스냅샷 정책값 중 최댓값(보수적) — 보통 전부 같다
    const threshold = Math.max(...exempted.map((r) => { const p = policyFromSnapshot(r.withholding_policy); return p && p.method === 'other_income' ? p.min_taxable_exempt : 0; }));
    if (combined <= threshold) continue;
    let extra = 0;
    const ids: string[] = [];
    for (const r of exempted) {
      const policy = policyFromSnapshot(r.withholding_policy);
      if (!policy || policy.method !== 'other_income') continue;
      const lines = Array.isArray(r.lines) ? (r.lines as unknown as SettlementLine[]) : [];
      const re = recomputeFromLines(lines, policy, { applyMinimum: false });
      if (re.withholding <= Number(r.withholding)) continue;
      extra += re.withholding - Number(r.withholding);
      ids.push(r.id);
      updates.push({ id: r.id, before: r, after: { taxable: re.taxable, income_tax: re.income_tax, local_tax: re.local_tax, withholding: re.withholding, net: re.net }, policy });
    }
    if (ids.length > 0) items.push({ mentorId, mentorName: nameOf.get(mentorId) ?? '-', combinedTaxable: combined, threshold, settlementIds: ids, extraWithholding: extra });
  }
  return { items, updates };
}

/** 제출 전 미리보기 — 과세최저한 재계산 대상과 합계 변화를 돌려준다 (저장 없음). */
export async function previewBatchSubmit(batchId: string): Promise<BatchSubmitPreview | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  { const denied = assertBatchTransition('submit', batch.status); if (denied) return { ok: false, error: denied }; }
  const { data } = await admin.from('settlements').select('gross, withholding, net').eq('batch_id', batchId).eq('status', 'batched');
  const before = sumSettlements((data ?? []).map((s) => ({ gross: Number(s.gross), withholding: Number(s.withholding), net: Number(s.net) })));
  const plan = await planMinimumRecompute(batchId);
  const extra = plan.items.reduce((s, i) => s + i.extraWithholding, 0);
  return { ok: true, recompute: plan.items, totalsBefore: before, totalsAfter: { gross: before.gross, withholding: before.withholding + extra, net: before.net - extra } };
}

async function applyMinimumRecompute(batchId: string, actorId: string, programId: string): Promise<BatchMinimumPreviewItem[]> {
  const admin = createAdminClient();
  const plan = await planMinimumRecompute(batchId);
  for (const u of plan.updates) {
    const policy: SnapshotPolicy = {
      ...u.policy,
      exempted: false,
      batch_min_recomputed: true,
      before_recompute: { taxable: Number(u.before.taxable), income_tax: Number(u.before.income_tax), local_tax: Number(u.before.local_tax), withholding: Number(u.before.withholding), net: Number(u.before.net) },
    };
    await admin.from('settlements').update({ taxable: u.after.taxable, income_tax: u.after.income_tax, local_tax: u.after.local_tax, withholding: u.after.withholding, net: u.after.net, withholding_policy: policy as unknown as Json }).eq('id', u.id).eq('batch_id', batchId).eq('status', 'batched');
    await audit(actorId, programId, 'settlement.withholding_recomputed', u.id, { batch_id: batchId, case_id: u.before.case_id, mentor_id: u.before.mentor_id, reason: 'batch_minimum_exceeded', before: policy.before_recompute, after: u.after }, 'settlements');
  }
  return plan.items;
}

/** 제출 철회·반려로 draft 로 돌아가면 품의 단위 재계산을 원복한다 — 다음 제출 때 다시 판정 */
async function revertMinimumRecompute(batchId: string, actorId: string, programId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from('settlements').select('id, case_id, mentor_id, withholding_policy').eq('batch_id', batchId).eq('status', 'batched');
  for (const r of data ?? []) {
    const p = policyFromSnapshot(r.withholding_policy);
    if (!p || !p.batch_min_recomputed || !p.before_recompute) continue;
    const b = p.before_recompute;
    const { before_recompute: _drop, batch_min_recomputed: _drop2, ...rest } = p;
    void _drop; void _drop2;
    const restored: SnapshotPolicy = { ...(rest as SnapshotPolicy), exempted: true };
    await admin.from('settlements').update({ taxable: b.taxable, income_tax: b.income_tax, local_tax: b.local_tax, withholding: b.withholding, net: b.net, withholding_policy: restored as unknown as Json }).eq('id', r.id).eq('batch_id', batchId);
    await audit(actorId, programId, 'settlement.withholding_recomputed', r.id, { batch_id: batchId, case_id: r.case_id, mentor_id: r.mentor_id, reason: 'batch_reverted_to_draft', after: b }, 'settlements');
  }
}

// ───────────────────────────────────────────── 제출 · 철회 · 반려 · 확인 · 지급

/** 품의 제출 (draft → submitted) — 과세최저한 품의 단위 재계산 후 합계 고정, 발주처에 알림 */
export async function submitBatch(batchId: string, actorId: string): Promise<BatchResult> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status, program_id, title').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  { const denied = assertBatchTransition('submit', batch.status); if (denied) return { ok: false, error: denied }; }
  const { count } = await admin.from('settlements').select('id', { count: 'exact', head: true }).eq('batch_id', batchId).eq('status', 'batched');
  if ((count ?? 0) === 0) return { ok: false, error: '편성된 정산 건이 없습니다.' };
  const recomputed = await applyMinimumRecompute(batchId, actorId, batch.program_id);
  const totals = await refreshBatchTotals(batchId);
  const { data: upd } = await admin.from('settlement_batches').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', batchId).eq('status', 'draft').select('id');
  if (!upd || upd.length === 0) return { ok: false, error: '이미 제출된 품의입니다.' };
  await notifyProgramStaff(batch.program_id, null, 'batch_submitted', ['institution']);
  await audit(actorId, batch.program_id, 'batch.submitted', batchId, { title: batch.title, count, gross: totals.gross, withholding: totals.withholding, net: totals.net, settlement_ids: totals.settlementIds, minimum_recomputed: recomputed.map((r) => ({ mentor_id: r.mentorId, settlement_ids: r.settlementIds, extra_withholding: r.extraWithholding })) });
  return { ok: true, batchId };
}

/** 제출 철회 (submitted → draft, 운영사) — 발주처 확인 전까지만. 발주처에 철회 알림 (P31) */
export async function unsubmitBatch(batchId: string, actorId: string): Promise<BatchResult> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status, program_id, title').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  { const denied = assertBatchTransition('unsubmit', batch.status); if (denied) return { ok: false, error: denied }; }
  const { data: upd } = await admin.from('settlement_batches').update({ status: 'draft', submitted_at: null }).eq('id', batchId).eq('status', 'submitted').select('id, program_id');
  if (!upd || upd.length === 0) return { ok: false, error: BATCH_TRANSITIONS.unsubmit.denied };
  await revertMinimumRecompute(batchId, actorId, batch.program_id);
  const totals = await refreshBatchTotals(batchId);
  await notifyProgramStaff(batch.program_id, null, 'batch_unsubmitted', ['institution']);
  await audit(actorId, batch.program_id, 'batch.unsubmitted', batchId, { title: batch.title, gross: totals.gross, withholding: totals.withholding, net: totals.net });
  return { ok: true, batchId };
}

/** (P31) 발주처 반려 (submitted → draft) — 사유 필수, 운영사 담당자에게 알림 */
export async function returnBatch(batchId: string, actorId: string, reason: string): Promise<BatchResult> {
  const why = reason.trim();
  if (!why) return { ok: false, error: '반려 사유를 입력하세요.' };
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status, program_id, title, note').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  { const denied = assertBatchTransition('return', batch.status); if (denied) return { ok: false, error: denied }; }
  const stamp = `[발주처 반려 ${new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)}] ${why}`;
  const note = batch.note ? `${batch.note}\n${stamp}` : stamp;
  const { data: upd } = await admin.from('settlement_batches').update({ status: 'draft', submitted_at: null, note }).eq('id', batchId).eq('status', 'submitted').select('id');
  if (!upd || upd.length === 0) return { ok: false, error: BATCH_TRANSITIONS.return.denied };
  await revertMinimumRecompute(batchId, actorId, batch.program_id);
  const totals = await refreshBatchTotals(batchId);
  await notifyProgramStaff(batch.program_id, null, 'batch_returned', ['nextlab']);
  await audit(actorId, batch.program_id, 'batch.returned', batchId, { title: batch.title, reason: why, gross: totals.gross, withholding: totals.withholding, net: totals.net, settlement_ids: totals.settlementIds });
  return { ok: true, batchId };
}

/**
 * T9 발주처 '정산 확인' (submitted → confirmed).
 * (P31) 포함된 정산의 케이스는 **열린 정산(pending·batched)이 더 없을 때** 종류와 무관하게 closed — 케이스 상태는 settlement_pending·settlement_batched 모두 허용.
 * 멘토·멘티 알림 + 운영사 담당자에게 확인 알림.
 */
export async function confirmBatch(batchId: string, actorId: string): Promise<BatchResult> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status, program_id, title').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  { const denied = assertBatchTransition('confirm', batch.status); if (denied) return { ok: false, error: denied }; }
  const now = new Date().toISOString();
  const { data: upd } = await admin.from('settlement_batches').update({ status: 'confirmed', confirmed_by: actorId, confirmed_at: now }).eq('id', batchId).eq('status', 'submitted').select('id');
  if (!upd || upd.length === 0) return { ok: false, error: '이미 처리된 품의입니다.' };

  const { data: items } = await admin.from('settlements').select('id, case_id, kind, mentor_id, gross, withholding, net').eq('batch_id', batchId).eq('status', 'batched');
  await admin.from('settlements').update({ status: 'confirmed' }).eq('batch_id', batchId).eq('status', 'batched');
  const list = items ?? [];
  const caseIds = Array.from(new Set(list.map((s) => s.case_id)));
  for (const caseId of caseIds) {
    if (await hasOpenSettlements(caseId)) continue;
    const { data: c } = await admin
      .from('cases')
      .select('id, status, mentee_id, program_id')
      .eq('id', caseId)
      .in('status', [...TRANSITIONS.confirm_settlement.from])
      .maybeSingle();
    if (!c) continue;
    const { data: closed } = await admin.from('cases').update({ status: 'closed', closed_at: now }).eq('id', caseId).eq('status', c.status).select('id');
    if (!closed || closed.length === 0) continue;
    await admin.from('case_status_history').insert({ case_id: caseId, from_status: c.status, to_status: 'closed', changed_by: actorId, note: `정산 확인 · 종결 (${batch.title})` });
    await admin.from('mentor_assignments').update({ is_active: false, ended_at: now, ended_by: actorId, end_kind: 'case_closed' }).eq('case_id', caseId).eq('is_active', true);
    const mentors = Array.from(new Set(list.filter((s) => s.case_id === caseId).map((s) => s.mentor_id)));
    for (const mentorId of mentors) await queueNotification(admin, { caseId, programId: c.program_id, recipientId: mentorId, triggerEvent: 'case_closed' });
    if (c.mentee_id) {
      await queueNotification(admin, { caseId, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'case_closed' });
      const { count } = await admin.from('survey_responses').select('id', { count: 'exact', head: true }).eq('case_id', caseId);
      if ((count ?? 0) === 0) await queueNotification(admin, { caseId, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'survey_reminder' });
    }
  }
  const totals = sumSettlements(list.map((s) => ({ gross: Number(s.gross), withholding: Number(s.withholding), net: Number(s.net) })));
  await notifyProgramStaff(batch.program_id, null, 'batch_confirmed', ['nextlab']);
  await audit(actorId, batch.program_id, 'batch.confirmed', batchId, { title: batch.title, count: list.length, gross: totals.gross, withholding: totals.withholding, net: totals.net, settlement_ids: list.map((s) => s.id) });
  return { ok: true, batchId };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * 지급 완료 표시 (confirmed → paid, 운영사). paidOn = KST 날짜(YYYY-MM-DD, 기본 오늘) — 미래 날짜는 거부 (P31).
 * 멘토에게 지급 완료 알림(실지급액 합계) 통보.
 */
export async function markBatchPaid(batchId: string, actorId: string, paidOn?: string): Promise<BatchResult> {
  const day = (paidOn ?? '').trim() || kstToday();
  if (!DATE_RE.test(day)) return { ok: false, error: '지급일은 YYYY-MM-DD 형식으로 입력하세요.' };
  if (day > kstToday()) return { ok: false, error: '지급일은 오늘 이후(미래)로 기록할 수 없습니다.' };
  const at = new Date(`${day}T00:00:00+09:00`).toISOString();
  const admin = createAdminClient();
  const { data: batch } = await admin.from('settlement_batches').select('id, status, program_id, title').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, error: '품의를 찾을 수 없습니다.' };
  { const denied = assertBatchTransition('mark_paid', batch.status); if (denied) return { ok: false, error: denied }; }
  const { data: upd } = await admin.from('settlement_batches').update({ status: 'paid', paid_at: at }).eq('id', batchId).eq('status', 'confirmed').select('id, program_id, title');
  if (!upd || upd.length === 0) return { ok: false, error: BATCH_TRANSITIONS.mark_paid.denied };
  const { data: items } = await admin.from('settlements').select('id, case_id, mentor_id, gross, withholding, net').eq('batch_id', batchId).eq('status', 'confirmed');
  await admin.from('settlements').update({ status: 'paid', paid_at: at }).eq('batch_id', batchId).eq('status', 'confirmed');
  const list = items ?? [];
  // 멘토별 실지급 합계로 1통씩
  const byMentor = new Map<string, { net: number; caseId: string }>();
  for (const s of list) {
    const cur = byMentor.get(s.mentor_id) ?? { net: 0, caseId: s.case_id };
    cur.net += Number(s.net);
    byMentor.set(s.mentor_id, cur);
  }
  for (const [mentorId, v] of Array.from(byMentor.entries())) {
    await queueNotification(admin, { caseId: v.caseId, programId: batch.program_id, recipientId: mentorId, triggerEvent: 'settlement_paid', payload: { batch_id: batchId, paid_on: day, message: `실지급 ${Math.round(v.net).toLocaleString('ko-KR')}원 (${day})` } });
  }
  const totals = sumSettlements(list.map((s) => ({ gross: Number(s.gross), withholding: Number(s.withholding), net: Number(s.net) })));
  await audit(actorId, batch.program_id, 'batch.paid', batchId, { title: batch.title, paid_at: at, paid_on: day, count: list.length, gross: totals.gross, withholding: totals.withholding, net: totals.net, settlement_ids: list.map((s) => s.id) });
  return { ok: true, batchId };
}
