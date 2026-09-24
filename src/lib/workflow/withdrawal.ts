import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { queueNotification } from '@/lib/workflow/notifications';
import { assertTransition, TRANSITIONS } from '@/lib/workflow/transitions';
import { createSettlementSnapshot, rollbackSettlements, settleLeftoverMentors } from '@/lib/settlement/settle';
import { dropPlannedRoundsOfMentor } from '@/lib/workflow/rounds';
import type { WorkflowResult } from '@/lib/workflow/cases';

/**
 * 중도 종료 3경로(멘티 중도 종료 · 멘토 자진 종료 승인 · 운영사 강제 종료) 공통 원칙 (P30):
 *  1) 정산 스냅샷(partial)을 **먼저** 만들고 실패하면 아무것도 바꾸지 않는다 — review.ts 와 같은 "금액 전이 반쪽 성공 금지".
 *  2) 상태 전이가 경쟁으로 실패하면 방금 만든 스냅샷을 취소한다.
 *  3) 종료된 멘토의 계획(미보고) 회차는 정리한다 — 새 멘토의 상한·보고서 등록을 막지 않게.
 *  4) 끝나면 미배정 케이스 추천을 다시 계산한다(이탈 멘토가 슬롯을 비웠으므로).
 */

async function rebalanceSafely(programId: string, actorId: string | null): Promise<void> {
  try {
    const { rebalanceAllOpenRecommendations } = await import('@/lib/matching/auto-match');
    await rebalanceAllOpenRecommendations(programId, actorId);
  } catch (err) {
    console.error('rebalance after withdrawal failed:', err);
  }
}

/** T10 멘티 중도 종료 (운영사·발주처). 활성 멘토·이전 멘토의 이행 회차는 partial 정산 스냅샷(0건이면 생략). */
export async function withdrawCase(caseId: string, actorId: string, reason: string): Promise<WorkflowResult> {
  if (!reason.trim()) return { ok: false, error: '중도 종료 사유를 입력하세요.' };
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status, program_id, mentee_id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const denied = assertTransition('withdraw_case', c.status);
  if (denied) return { ok: false, error: denied };

  const { data: assign } = await admin.from('mentor_assignments').select('id, mentor_id').eq('case_id', caseId).eq('is_active', true).maybeSingle();

  // 1) 정산 먼저
  const created: string[] = [];
  if (assign) {
    const snap = await createSettlementSnapshot({ caseId, mentorId: assign.mentor_id, kind: 'partial', actorId, note: `멘티 중도 종료: ${reason.trim()}` });
    if (!snap.ok) return { ok: false, error: `부분 정산 실패로 중도 종료를 진행하지 않았습니다: ${snap.error}` };
    if (snap.settlementId) created.push(snap.settlementId);
  }
  const leftover = await settleLeftoverMentors(caseId, actorId, assign?.mentor_id ?? null, '멘티 중도 종료');
  if (!leftover.ok) {
    await rollbackSettlements(created, actorId, leftover.error);
    return { ok: false, error: `부분 정산 실패로 중도 종료를 진행하지 않았습니다: ${leftover.error}` };
  }
  created.push(...leftover.settlementIds);

  // 2) 상태 전이
  const now = new Date().toISOString();
  const { data: upd } = await admin
    .from('cases')
    .update({ status: 'withdrawn', withdrawn_at: now, withdrawn_reason: reason.trim() })
    .eq('id', caseId)
    .in('status', [...TRANSITIONS.withdraw_case.from])
    .select('id');
  if (!upd || upd.length === 0) {
    await rollbackSettlements(created, actorId, '상태 경쟁으로 자동 취소');
    return { ok: false, error: '이미 처리된 케이스입니다.' };
  }
  await admin.from('case_status_history').insert({ case_id: caseId, from_status: c.status, to_status: 'withdrawn', changed_by: actorId, note: `중도 종료: ${reason.trim()}` });

  // 3) 배정 종료 + 계획 회차 정리
  if (assign) {
    await admin.from('mentor_assignments').update({ is_active: false, ended_at: now, ended_by: actorId, end_kind: 'case_withdrawn', end_reason: reason.trim() }).eq('id', assign.id);
    await dropPlannedRoundsOfMentor(caseId, assign.mentor_id, actorId);
    await queueNotification(admin, { caseId, programId: c.program_id, recipientId: assign.mentor_id, triggerEvent: 'case_withdrawn' });
  }
  if (c.mentee_id) await queueNotification(admin, { caseId, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'case_withdrawn' });
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: 'case.withdrawn', entity_type: 'cases', entity_id: caseId, metadata: { reason: reason.trim(), settlement_ids: created } });
  await rebalanceSafely(c.program_id, actorId);
  return { ok: true, caseId };
}

/** T11a 멘토 자진 중도 종료 요청 승인 → reassignment_pending + 부분 정산 */
export async function decideMentorWithdrawal(requestId: string, actorId: string, decision: 'approved' | 'rejected', note: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: req } = await admin.from('mentor_withdrawal_requests').select('id, case_id, assignment_id, mentor_id, status, reason').eq('id', requestId).maybeSingle();
  if (!req) return { ok: false, error: '요청을 찾을 수 없습니다.' };
  if (req.status !== 'pending') return { ok: false, error: '이미 처리된 요청입니다.' };
  if (decision === 'rejected' && !note.trim()) return { ok: false, error: '반려 사유를 입력하세요.' };
  const { data: c } = await admin.from('cases').select('id, status, program_id, mentee_id').eq('id', req.case_id).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const now = new Date().toISOString();

  if (decision === 'rejected') {
    await admin.from('mentor_withdrawal_requests').update({ status: 'rejected', decided_by: actorId, decided_at: now, decision_note: note.trim() }).eq('id', requestId).eq('status', 'pending');
    await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: 'mentor.withdrawal_rejected', entity_type: 'cases', entity_id: c.id, metadata: { request_id: requestId, note: note.trim() } });
    return { ok: true, caseId: c.id };
  }

  const denied = assertTransition('approve_mentor_withdrawal', c.status);
  if (denied) return { ok: false, error: denied };
  const { data: assign } = await admin.from('mentor_assignments').select('id, mentor_id, is_active').eq('id', req.assignment_id).maybeSingle();
  if (!assign || !assign.is_active || assign.mentor_id !== req.mentor_id) return { ok: false, error: '요청 당시의 배정이 더 이상 활성 상태가 아닙니다.' };

  // 1) 정산 먼저
  const snap = await createSettlementSnapshot({ caseId: c.id, mentorId: req.mentor_id, kind: 'partial', actorId, note: '멘토 자진 중도 종료' });
  if (!snap.ok) return { ok: false, error: `부분 정산 실패로 승인을 진행하지 않았습니다: ${snap.error}` };
  const created = snap.settlementId ? [snap.settlementId] : [];

  // 2) 상태 전이
  const { data: upd } = await admin.from('cases').update({ status: 'reassignment_pending' }).eq('id', c.id).in('status', [...TRANSITIONS.approve_mentor_withdrawal.from]).select('id');
  if (!upd || upd.length === 0) {
    await rollbackSettlements(created, actorId, '상태 경쟁으로 자동 취소');
    return { ok: false, error: '이미 처리된 케이스입니다.' };
  }
  await admin.from('mentor_withdrawal_requests').update({ status: 'approved', decided_by: actorId, decided_at: now, decision_note: note.trim() || null }).eq('id', requestId);
  await admin.from('mentor_assignments').update({ is_active: false, ended_at: now, ended_by: actorId, end_kind: 'mentor_withdrawal', end_reason: req.reason, reason_visibility: 'all' }).eq('id', assign.id);
  await admin.from('case_status_history').insert({ case_id: c.id, from_status: c.status, to_status: 'reassignment_pending', changed_by: actorId, note: `멘토 중도 종료 승인: ${req.reason}` });
  await dropPlannedRoundsOfMentor(c.id, req.mentor_id, actorId);
  await queueNotification(admin, { caseId: c.id, programId: c.program_id, recipientId: req.mentor_id, triggerEvent: 'mentor_ended' });
  if (c.mentee_id) await queueNotification(admin, { caseId: c.id, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'mentor_ended' });
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: 'mentor.withdrawal_approved', entity_type: 'cases', entity_id: c.id, metadata: { request_id: requestId, settlement_id: snap.settlementId } });
  await rebalanceSafely(c.program_id, actorId);
  return { ok: true, caseId: c.id };
}

/**
 * T11b 운영사 강제 종료 — 사유는 운영사·발주처만 열람(reason_visibility='staff_only').
 * 이행 회차가 있으면 부분 정산(먼저), 계획 회차는 정리.
 */
export async function forceEndMentor(caseId: string, actorId: string, reason: string): Promise<WorkflowResult> {
  if (!reason.trim()) return { ok: false, error: '강제 종료 사유를 입력하세요(운영사·발주처만 열람).' };
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status, program_id, mentee_id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const denied = assertTransition('force_end_mentor', c.status);
  if (denied) return { ok: false, error: denied };
  const { data: assign } = await admin.from('mentor_assignments').select('id, mentor_id').eq('case_id', caseId).eq('is_active', true).maybeSingle();
  if (!assign) return { ok: false, error: '활성 멘토가 없습니다.' };

  // 1) 정산 먼저
  const snap = await createSettlementSnapshot({ caseId, mentorId: assign.mentor_id, kind: 'partial', actorId, note: '운영사 강제 종료' });
  if (!snap.ok) return { ok: false, error: `부분 정산 실패로 종료를 진행하지 않았습니다: ${snap.error}` };
  const created = snap.settlementId ? [snap.settlementId] : [];

  // 2) 상태 전이
  const now = new Date().toISOString();
  const { data: upd } = await admin.from('cases').update({ status: 'reassignment_pending' }).eq('id', caseId).in('status', [...TRANSITIONS.force_end_mentor.from]).select('id');
  if (!upd || upd.length === 0) {
    await rollbackSettlements(created, actorId, '상태 경쟁으로 자동 취소');
    return { ok: false, error: '이미 처리된 케이스입니다.' };
  }
  await admin.from('mentor_assignments').update({ is_active: false, ended_at: now, ended_by: actorId, end_kind: 'forced', end_reason: reason.trim(), reason_visibility: 'staff_only' }).eq('id', assign.id);
  await admin.from('mentor_withdrawal_requests').update({ status: 'rejected', decided_by: actorId, decided_at: now, decision_note: '운영사 강제 종료로 대체' }).eq('assignment_id', assign.id).eq('status', 'pending');
  await admin.from('case_status_history').insert({ case_id: caseId, from_status: c.status, to_status: 'reassignment_pending', changed_by: actorId, note: '운영사 결정으로 멘토 종료' });
  await dropPlannedRoundsOfMentor(caseId, assign.mentor_id, actorId);
  await queueNotification(admin, { caseId, programId: c.program_id, recipientId: assign.mentor_id, triggerEvent: 'mentor_ended' });
  if (c.mentee_id) await queueNotification(admin, { caseId, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'mentor_ended' });
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: 'mentor.force_ended', entity_type: 'cases', entity_id: caseId, metadata: { assignment_id: assign.id, reason: reason.trim(), settlement_id: snap.settlementId } });
  await rebalanceSafely(c.program_id, actorId);
  return { ok: true, caseId };
}
