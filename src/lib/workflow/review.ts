import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { queueNotification } from '@/lib/workflow/notifications';
import { assertTransition, TRANSITIONS } from '@/lib/workflow/transitions';
import { notifyProgramStaff } from '@/lib/workflow/closure';
import { createSettlementSnapshot } from '@/lib/settlement/settle';
import type { WorkflowResult } from '@/lib/workflow/cases';

/**
 * T6 보완 요청 / T7 검수 승인 (운영사).
 * 승인 시 활성 멘토의 정산을 **확정 스냅샷**으로 저장하고 케이스를 settlement_pending 으로 옮긴다.
 * 스냅샷 저장이 실패하면 상태를 바꾸지 않는다(금액이 걸린 전이 — 반쪽 성공 금지).
 */
export async function reviewClosure(caseId: string, actorId: string, result: 'approved' | 'revision_requested', comment: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status, program_id, mentee_id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const key = result === 'approved' ? 'review_approve' : 'review_revision';
  const denied = assertTransition(key, c.status);
  if (denied) return { ok: false, error: denied };
  if (result === 'revision_requested' && !comment.trim()) return { ok: false, error: '보완 요청 사유를 입력하세요.' };

  const { data: assign } = await admin.from('mentor_assignments').select('mentor_id').eq('case_id', caseId).eq('is_active', true).maybeSingle();
  if (!assign) return { ok: false, error: '활성 멘토가 없습니다. 멘토를 먼저 배정하세요.' };

  if (result === 'revision_requested') {
    const { data: upd } = await admin.from('cases').update({ status: 'revision_requested' }).eq('id', caseId).in('status', [...TRANSITIONS.review_revision.from]).select('id');
    if (!upd || upd.length === 0) return { ok: false, error: '이미 처리된 케이스입니다.' };
    await admin.from('reviews').insert({ case_id: caseId, reviewer_id: actorId, result: 'revision_requested', comment: comment.trim(), kind: 'closure' });
    await admin.from('case_status_history').insert({ case_id: caseId, from_status: c.status, to_status: 'revision_requested', changed_by: actorId, note: `보완 요청: ${comment.trim()}` });
    await queueNotification(admin, { caseId, programId: c.program_id, recipientId: assign.mentor_id, triggerEvent: 'revision_requested', payload: { message: comment.trim().slice(0, 80) } });
    await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: 'case.review_revision', entity_type: 'cases', entity_id: caseId, metadata: { comment: comment.trim() } });
    return { ok: true, caseId };
  }

  // T7: 정산 스냅샷 먼저(실패 시 중단) → 상태 전이
  const snap = await createSettlementSnapshot({ caseId, mentorId: assign.mentor_id, kind: 'closure', actorId, note: comment.trim() || undefined });
  if (!snap.ok) return { ok: false, error: `정산 확정 실패: ${snap.error}` };
  if (!snap.settlementId) return { ok: false, error: '정산할 회차가 없습니다(이미 정산됐거나 회차 미등록). 검수 승인을 진행할 수 없습니다.' };

  const { data: upd } = await admin.from('cases').update({ status: 'settlement_pending' }).eq('id', caseId).in('status', [...TRANSITIONS.review_approve.from]).select('id');
  if (!upd || upd.length === 0) {
    // 경쟁 조건: 스냅샷은 만들어졌지만 상태가 이미 바뀜 → 스냅샷을 취소 표시하지 않고 그대로 두면 이중 정산 위험. 되돌린다.
    await admin.from('mentoring_logs').update({ settlement_id: null }).eq('settlement_id', snap.settlementId);
    await admin.from('settlements').update({ status: 'canceled', canceled_by: actorId, canceled_at: new Date().toISOString(), cancel_reason: '상태 경쟁으로 자동 취소' }).eq('id', snap.settlementId);
    return { ok: false, error: '이미 처리된 케이스입니다. 새로고침 후 다시 확인하세요.' };
  }
  await admin.from('reviews').insert({ case_id: caseId, reviewer_id: actorId, result: 'approved', comment: comment.trim() || null, kind: 'closure', settlement_id: snap.settlementId });
  await admin.from('case_status_history').insert({ case_id: caseId, from_status: c.status, to_status: 'settlement_pending', changed_by: actorId, note: '검수 승인 · 정산 확정' });
  await notifyProgramStaff(c.program_id, caseId, 'settlement_confirmed', ['institution']);
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: 'case.review_approve', entity_type: 'cases', entity_id: caseId, metadata: { settlement_id: snap.settlementId, net: snap.result?.net ?? null } });
  return { ok: true, caseId };
}
