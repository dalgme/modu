import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { queueNotification } from '@/lib/workflow/notifications';
import { assertTransition, TRANSITIONS } from '@/lib/workflow/transitions';
import { normalizeObservation } from '@/lib/workflow/closure';
import { missingRequiredMenteeDocs } from '@/lib/workflow/case-documents';
import { createSettlementSnapshot, estimateSettlements, rollbackSettlements, settleLeftoverMentors } from '@/lib/settlement/settle';
import type { WorkflowResult } from '@/lib/workflow/cases';

/** 검수 승인 시 클라이언트가 보고 있던 예상값 — 서버 재계산과 다르면 거부한다 (P31) */
export interface ApprovalExpectation {
  net: number;
  roundIds: string[];
}
export const EXPECTATION_CHANGED = '예상 금액이 바뀌었습니다. 새로고침 후 다시 확인하세요.';

export interface ApprovalReadiness {
  ok: boolean;
  reason: string;
  reported: number;
  required: number;
  hasObservation: boolean;
  /** 이미 확정(취소 아님) 정산이 있어, 미정산 회차가 0건이어도 승인(종결)만 진행할 수 있는 케이스 (P32 리뷰 #7) */
  settledAlready?: boolean;
}

/**
 * (P31) 종결 검수 승인 가능 여부 — 멘토의 종결 요청 게이트(closure.ts checkClosureReadiness)와 **같은 규칙**을
 * closure_requested 상태에서 다시 검증한다(종결 요청 뒤 회차 삭제·관찰의견서 교체·정책 변경이 있었을 수 있다).
 *  회차 ≥ 필수(+승인 추가) 이고 전부 보고서 등록 · 관찰의견서(웹 총평 또는 업로드본) · (정책) 멘티 확인 서명 · (정책) 그룹 필수서류.
 * 버튼 활성(closure-review-panel canApprove)과 서버 게이트(reviewClosure)가 함께 이 함수를 읽는다.
 */
export async function canApproveClosure(caseId: string): Promise<ApprovalReadiness> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status, program_id, support_type_id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, reason: '케이스를 찾을 수 없습니다.', reported: 0, required: 0, hasObservation: false };
  const [{ data: group }, { data: program }, { data: logs }, { data: obs }, { data: obsFile }, { count: settledCount }] = await Promise.all([
    admin.from('support_types').select('required_rounds').eq('id', c.support_type_id).maybeSingle(),
    admin.from('programs').select('closure_policy').eq('id', c.program_id).maybeSingle(),
    admin.from('mentoring_logs').select('round_no, mentee_signed_at, report_registered_at').eq('case_id', caseId).order('round_no'),
    admin.from('observation_reports').select('content').eq('case_id', caseId).maybeSingle(),
    admin.from('documents').select('id').eq('case_id', caseId).eq('doc_key', 'observation_report').maybeSingle(),
    admin.from('settlements').select('id', { count: 'exact', head: true }).eq('case_id', caseId).neq('status', 'canceled'),
  ]);
  const rounds = logs ?? [];
  const required = group?.required_rounds ?? 0;
  const reported = rounds.filter((r) => r.report_registered_at).length;
  const hasObservation = (obs ? normalizeObservation(obs.content).summary.trim().length > 0 : false) || !!obsFile;
  const base = { reported, required, hasObservation, settledAlready: (settledCount ?? 0) > 0 };
  const denied = assertTransition('review_approve', c.status);
  if (denied) return { ok: false, reason: denied, ...base };
  if (rounds.length < required) return { ok: false, reason: `필수 회차 ${required}회 중 ${rounds.length}회만 등록되어 있습니다.`, ...base };
  const unreported = rounds.filter((r) => !r.report_registered_at).map((r) => r.round_no);
  if (unreported.length > 0) return { ok: false, reason: `보고서가 없는 회차(${unreported.join('·')}회차)가 있습니다. 멘토에게 보완을 요청하세요.`, ...base };
  if (!hasObservation) return { ok: false, reason: '관찰의견서가 없습니다(총평 미작성·파일 없음). 보완을 요청하세요.', ...base };
  const policy = (program?.closure_policy ?? {}) as { require_mentee_signature?: boolean; require_group_docs?: boolean };
  if (policy.require_mentee_signature && rounds.some((r) => !r.mentee_signed_at)) {
    return { ok: false, reason: '이 행사는 모든 회차에 멘티 확인 서명이 있어야 승인할 수 있습니다. 서명이 없는 회차가 있습니다.', ...base };
  }
  if (policy.require_group_docs) {
    const missing = await missingRequiredMenteeDocs(caseId);
    if (missing.length > 0) return { ok: false, reason: `멘티 필수서류가 누락되어 승인할 수 없습니다: ${missing.join(', ')}`, ...base };
  }
  return { ok: true, reason: '승인하면 예상 금액이 그대로 확정 스냅샷으로 저장됩니다.', ...base };
}

/**
 * T6 보완 요청 / T7 검수 승인 (운영사).
 * 승인 시 활성 멘토의 정산을 **확정 스냅샷**으로 저장하고 케이스를 settlement_pending 으로 옮긴다.
 * 스냅샷 저장이 실패하면 상태를 바꾸지 않는다(금액이 걸린 전이 — 반쪽 성공 금지).
 */
export async function reviewClosure(caseId: string, actorId: string, result: 'approved' | 'revision_requested', comment: string, expected?: ApprovalExpectation | null): Promise<WorkflowResult> {
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

  // (P31) 승인 직전 종결 요건 재검증 — 종결 요청 뒤 회차·관찰의견서·정책이 바뀌었을 수 있다
  const ready = await canApproveClosure(caseId);
  if (!ready.ok) return { ok: false, error: ready.reason };

  // (P31) 화면이 본 예상값과 서버 재계산이 다르면 거부 — 회차 정정·단가 변경 사이의 경쟁
  if (expected) {
    const est = await estimateSettlements(caseId);
    const net = est.reduce((s, e) => s + e.result.net, 0);
    const ids = est.flatMap((e) => e.rounds.map((r) => r.log_id)).sort();
    const want = [...expected.roundIds].sort();
    const same = Math.round(net) === Math.round(expected.net) && ids.length === want.length && ids.every((id, i) => id === want[i]);
    if (!same) return { ok: false, error: EXPECTATION_CHANGED };
  }

  // T7: 정산 스냅샷 먼저(실패 시 중단) → 상태 전이.
  // 활성 멘토 closure + 교체 이력 멘토의 미정산 회차 partial 을 함께 확정한다 (P30 — 이전 멘토 회차가 영구 미정산으로 남던 문제).
  const snap = await createSettlementSnapshot({ caseId, mentorId: assign.mentor_id, kind: 'closure', actorId, note: comment.trim() || undefined });
  if (!snap.ok) return { ok: false, error: `정산 확정 실패: ${snap.error}` };
  const createdIds: string[] = snap.settlementId ? [snap.settlementId] : [];
  const leftover = await settleLeftoverMentors(caseId, actorId, assign.mentor_id, '종결 검수 승인(이전 멘토 회차)');
  if (!leftover.ok) {
    await rollbackSettlements(createdIds, actorId, leftover.error);
    return { ok: false, error: leftover.error };
  }
  createdIds.push(...leftover.settlementIds);
  if (createdIds.length === 0) {
    // 활성 멘토·이전 멘토 모두 새로 정산할 회차가 없다 — 이미 전부 정산(부분 정산 등)된 케이스만 종결로 넘긴다
    const { count: settledCount } = await admin.from('settlements').select('id', { count: 'exact', head: true }).eq('case_id', caseId).neq('status', 'canceled');
    if (ready.reported < ready.required || (settledCount ?? 0) === 0) {
      return { ok: false, error: '정산할 회차가 없습니다(이미 정산됐거나 회차 미등록). 검수 승인을 진행할 수 없습니다.' };
    }
  }

  const { data: upd } = await admin.from('cases').update({ status: 'settlement_pending' }).eq('id', caseId).in('status', [...TRANSITIONS.review_approve.from]).select('id');
  if (!upd || upd.length === 0) {
    // 경쟁 조건: 스냅샷은 만들어졌지만 상태가 이미 바뀜 → 이중 정산 위험이므로 되돌린다.
    await rollbackSettlements(createdIds, actorId, '상태 경쟁으로 자동 취소');
    return { ok: false, error: '이미 처리된 케이스입니다. 새로고침 후 다시 확인하세요.' };
  }
  await admin.from('reviews').insert({ case_id: caseId, reviewer_id: actorId, result: 'approved', comment: comment.trim() || null, kind: 'closure', settlement_id: snap.settlementId });
  await admin.from('case_status_history').insert({ case_id: caseId, from_status: c.status, to_status: 'settlement_pending', changed_by: actorId, note: '검수 승인 · 정산 확정' });
  // (P31) 발주처에는 케이스별 확정 통보를 보내지 않는다 — 품의 제출(batch_submitted) 시점에 한 번 통보. 멘토 통보는 createSettlementSnapshot 이 담당.
  const { error: auditError } = await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: 'case.review_approve', entity_type: 'cases', entity_id: caseId, metadata: { settlement_id: snap.settlementId, net: snap.result?.net ?? null, leftover_settlement_ids: leftover.settlementIds } });
  if (auditError) console.error('case.review_approve audit insert failed:', auditError.message);
  return { ok: true, caseId };
}
