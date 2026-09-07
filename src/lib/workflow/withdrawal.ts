import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { queueNotification } from '@/lib/workflow/notifications';
import { assertTransition, TRANSITIONS } from '@/lib/workflow/transitions';
import { createSettlementSnapshot } from '@/lib/settlement/settle';
import type { WorkflowResult } from '@/lib/workflow/cases';

/**
 * T10 멘티 중도 종료 (운영사·발주처). 활성 멘토의 이행 회차는 partial 정산 스냅샷(0건이면 생략).
 */
export async function withdrawCase(caseId: string, actorId: string, reason: string): Promise<WorkflowResult> {
  if (!reason.trim()) return { ok: false, error: '중도 종료 사유를 입력하세요.' };
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status, program_id, mentee_id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const denied = assertTransition('withdraw_case', c.status);
  if (denied) return { ok: false, error: denied };

  const now = new Date().toISOString();
  const { data: upd } = await admin
    .from('cases')
    .update({ status: 'withdrawn', withdrawn_at: now, withdrawn_reason: reason.trim() })
    .eq('id', caseId)
    .in('status', [...TRANSITIONS.withdraw_case.from])
    .select('id');
  if (!upd || upd.length === 0) return { ok: false, error: '이미 처리된 케이스입니다.' };
  await admin.from('case_status_history').insert({ case_id: caseId, from_status: c.status, to_status: 'withdrawn', changed_by: actorId, note: `중도 종료: ${reason.trim()}` });

  // 활성 배정 종료 + 이행 회차 부분 정산
  const { data: assign } = await admin.from('mentor_assignments').select('id, mentor_id').eq('case_id', caseId).eq('is_active', true).maybeSingle();
  let settlementId: string | null = null;
  if (assign) {
    await admin.from('mentor_assignments').update({ is_active: false, ended_at: now, ended_by: actorId, end_kind: 'case_withdrawn', end_reason: reason.trim() }).eq('id', assign.id);
    const snap = await createSettlementSnapshot({ caseId, mentorId: assign.mentor_id, kind: 'partial', actorId, note: `멘티 중도 종료: ${reason.trim()}` });
    if (snap.ok) settlementId = snap.settlementId;
    await queueNotification(admin, { caseId, programId: c.program_id, recipientId: assign.mentor_id, triggerEvent: 'case_withdrawn' });
  }
  // 이전 멘토(교체 이력)의 미정산 회차도 부분 정산
  await settleLeftoverMentors(caseId, actorId, assign?.mentor_id ?? null, '멘티 중도 종료');
  if (c.mentee_id) await queueNotification(admin, { caseId, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'case_withdrawn' });
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: 'case.withdrawn', entity_type: 'cases', entity_id: caseId, metadata: { reason: reason.trim(), settlement_id: settlementId } });
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

  const { data: upd } = await admin.from('cases').update({ status: 'reassignment_pending' }).eq('id', c.id).in('status', [...TRANSITIONS.approve_mentor_withdrawal.from]).select('id');
  if (!upd || upd.length === 0) return { ok: false, error: '이미 처리된 케이스입니다.' };
  await admin.from('mentor_withdrawal_requests').update({ status: 'approved', decided_by: actorId, decided_at: now, decision_note: note.trim() || null }).eq('id', requestId);
  await admin.from('mentor_assignments').update({ is_active: false, ended_at: now, ended_by: actorId, end_kind: 'mentor_withdrawal', end_reason: req.reason, reason_visibility: 'all' }).eq('id', assign.id);
  await admin.from('case_status_history').insert({ case_id: c.id, from_status: c.status, to_status: 'reassignment_pending', changed_by: actorId, note: `멘토 중도 종료 승인: ${req.reason}` });
  const snap = await createSettlementSnapshot({ caseId: c.id, mentorId: req.mentor_id, kind: 'partial', actorId, note: '멘토 자진 중도 종료' });
  await queueNotification(admin, { caseId: c.id, programId: c.program_id, recipientId: req.mentor_id, triggerEvent: 'mentor_ended' });
  if (c.mentee_id) await queueNotification(admin, { caseId: c.id, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'mentor_ended' });
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: 'mentor.withdrawal_approved', entity_type: 'cases', entity_id: c.id, metadata: { request_id: requestId, settlement_id: snap.ok ? snap.settlementId : null, settlement_error: snap.ok ? null : snap.error } });
  return { ok: true, caseId: c.id };
}

/**
 * T11b 운영사 강제 종료 — 사유는 운영사·발주처만 열람(reason_visibility='staff_only').
 * 이행 회차가 있으면 부분 정산.
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
  const now = new Date().toISOString();
  const { data: upd } = await admin.from('cases').update({ status: 'reassignment_pending' }).eq('id', caseId).in('status', [...TRANSITIONS.force_end_mentor.from]).select('id');
  if (!upd || upd.length === 0) return { ok: false, error: '이미 처리된 케이스입니다.' };
  await admin.from('mentor_assignments').update({ is_active: false, ended_at: now, ended_by: actorId, end_kind: 'forced', end_reason: reason.trim(), reason_visibility: 'staff_only' }).eq('id', assign.id);
  await admin.from('mentor_withdrawal_requests').update({ status: 'rejected', decided_by: actorId, decided_at: now, decision_note: '운영사 강제 종료로 대체' }).eq('assignment_id', assign.id).eq('status', 'pending');
  await admin.from('case_status_history').insert({ case_id: caseId, from_status: c.status, to_status: 'reassignment_pending', changed_by: actorId, note: '운영사 결정으로 멘토 종료' });
  const snap = await createSettlementSnapshot({ caseId, mentorId: assign.mentor_id, kind: 'partial', actorId, note: '운영사 강제 종료' });
  await queueNotification(admin, { caseId, programId: c.program_id, recipientId: assign.mentor_id, triggerEvent: 'mentor_ended' });
  if (c.mentee_id) await queueNotification(admin, { caseId, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'mentor_ended' });
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: 'mentor.force_ended', entity_type: 'cases', entity_id: caseId, metadata: { assignment_id: assign.id, reason: reason.trim(), settlement_id: snap.ok ? snap.settlementId : null } });
  return { ok: true, caseId };
}

/** 교체 이력상 이전 멘토들의 미정산 회차를 partial 로 정리 (종료 시점) */
async function settleLeftoverMentors(caseId: string, actorId: string, excludeMentorId: string | null, note: string): Promise<void> {
  const admin = createAdminClient();
  const { data: logs } = await admin.from('mentoring_logs').select('mentor_id').eq('case_id', caseId).is('settlement_id', null);
  const mentors = Array.from(new Set((logs ?? []).map((l) => l.mentor_id))).filter((m) => m !== excludeMentorId);
  for (const m of mentors) await createSettlementSnapshot({ caseId, mentorId: m, kind: 'partial', actorId, note });
}
