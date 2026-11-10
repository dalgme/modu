import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { settleLeftoverMentors } from '@/lib/settlement/settle';
import { autoBatchSettlements } from '@/lib/workflow/batches';
import { logAudit } from '@/lib/workflow/audit';

/**
 * 선행 멘토 정산 (2026-11-10) — 멘토가 중간에 바뀐(재배정·멘토 중도 종료·강제 종료) 멘티에서
 * **이전 멘토가 이미 진행해 보고서까지 등록한 회차**를 그 자리에서 정산(partial 스냅샷)하고, 지급 품의를 자동 편성·제출한다.
 * 이전에는 이 정산이 멘티의 종결 검수(새 멘토의 남은 회차 완료)까지 미뤄지거나, 부분 정산이 '지급 대기'에 머물러 있었다.
 *
 *  - 대상 케이스 = 진행 중 단계(아래 OPEN_STATUSES). 종결 검수 이후 단계는 검수 승인이 정산·품의를 함께 처리하고,
 *    중도 종료(withdrawn) 케이스는 [복귀] 가능성을 위해 기존대로 운영사가 직접 편성한다.
 *  - 대상 멘토 = 그 케이스의 **현재 활성 멘토가 아닌** 멘토(배정이 끝난 멘토).
 *  - 금액 계산은 기존 `createSettlementSnapshot`(compute.ts 단일 함수) 그대로, 편성·제출은 검수 승인과 같은 `autoBatchSettlements`.
 *  - 케이스 단계는 바꾸지 않는다(품의 편성·발주처 확인의 케이스 이동은 정산 대기·품의 단계 케이스에만 적용 — transitions.ts).
 */
export const PRIOR_MENTOR_OPEN_STATUSES = ['mentor_assigned', 'in_progress', 'reassignment_pending', 'revision_requested', 'closure_requested'] as const;

export interface PriorSettleResult {
  createdIds: string[];
  batchedIds: string[];
  errors: string[];
}

/** 케이스 1건 — 이전 멘토 미정산 회차 정산 + 이전 멘토의 지급 대기 부분 정산을 품의로 자동 편성·제출 */
export async function settlePriorMentors(caseId: string, actorId: string, note: string): Promise<PriorSettleResult> {
  const admin = createAdminClient();
  const out: PriorSettleResult = { createdIds: [], batchedIds: [], errors: [] };
  const { data: c } = await admin.from('cases').select('id, status, program_id').eq('id', caseId).maybeSingle();
  if (!c || !(PRIOR_MENTOR_OPEN_STATUSES as readonly string[]).includes(c.status)) return out;
  const { data: active } = await admin.from('mentor_assignments').select('mentor_id').eq('case_id', caseId).eq('is_active', true).maybeSingle();
  const activeMentorId = active?.mentor_id ?? null;

  // 1) 이전 멘토의 미정산(보고서 등록) 회차 → partial 스냅샷
  const leftover = await settleLeftoverMentors(caseId, actorId, activeMentorId, note);
  if (!leftover.ok) {
    out.errors.push(leftover.error);
  } else out.createdIds.push(...leftover.settlementIds);

  // 2) 이전 멘토의 지급 대기 부분 정산(방금 만든 것 + 예전에 만들어 두고 편성 안 된 것) → 멘토별 품의 자동 편성·제출
  let q = admin.from('settlements').select('id, mentor_id').eq('case_id', caseId).eq('kind', 'partial').eq('status', 'pending').is('batch_id', null);
  if (activeMentorId) q = q.neq('mentor_id', activeMentorId);
  const { data: pending } = await q;
  const ids = (pending ?? []).map((s) => s.id);
  if (ids.length > 0) {
    const outcomes = await autoBatchSettlements(caseId, ids, actorId, { note: `선행 멘토 정산 — ${note}`, titleSuffix: '(선행 멘토 정산)' });
    for (const o of outcomes) {
      if (o.error) out.errors.push(o.error);
    }
    const okMentors = new Set(outcomes.filter((o) => !o.error).map((o) => o.mentorId));
    out.batchedIds.push(...(pending ?? []).filter((s) => okMentors.has(s.mentor_id)).map((s) => s.id));
  }
  if (out.createdIds.length || out.batchedIds.length || out.errors.length) {
    await logAudit(admin, {
      actorId,
      programId: c.program_id,
      action: 'settlement.prior_mentor',
      entityType: 'cases',
      entityId: caseId,
      metadata: { case_id: caseId, note, created: out.createdIds, batched: out.batchedIds, errors: out.errors },
    });
  }
  return out;
}

/** 멘토 교체·중도 종료 직후 호출용 — 실패해도 본 작업은 유지(정산은 지급 대기로 남아 수동 편성 가능, 감사에 기록) */
export async function settlePriorMentorsSafely(caseId: string, actorId: string, note: string): Promise<void> {
  try {
    await settlePriorMentors(caseId, actorId, note);
  } catch (e) {
    console.error('[prior-mentors] 선행 멘토 정산 실패', e instanceof Error ? e.message : e);
  }
}

/** 행사 안에서 선행 멘토 정산이 밀려 있는 케이스 (정산·품의 화면 안내·일괄 실행용) */
export async function listPriorMentorBacklog(programId: string): Promise<{ caseIds: string[]; unsettledRounds: number; pendingPartials: number }> {
  const admin = createAdminClient();
  const cases = await fetchAll<{ id: string }>((from, to) =>
    admin.from('cases').select('id').eq('program_id', programId).in('status', [...PRIOR_MENTOR_OPEN_STATUSES]).range(from, to),
  );
  const caseIds = cases.map((c) => c.id);
  if (caseIds.length === 0) return { caseIds: [], unsettledRounds: 0, pendingPartials: 0 };
  const [assigns, logs, partials] = await Promise.all([
    fetchAllIn<{ case_id: string; mentor_id: string; is_active: boolean }>(caseIds, (chunk, from, to) =>
      admin.from('mentor_assignments').select('case_id, mentor_id, is_active').in('case_id', chunk).range(from, to),
    ),
    fetchAllIn<{ case_id: string; mentor_id: string }>(caseIds, (chunk, from, to) =>
      admin.from('mentoring_logs').select('case_id, mentor_id').in('case_id', chunk).not('report_registered_at', 'is', null).is('settlement_id', null).range(from, to),
    ),
    fetchAllIn<{ case_id: string; mentor_id: string }>(caseIds, (chunk, from, to) =>
      admin.from('settlements').select('case_id, mentor_id').in('case_id', chunk).eq('kind', 'partial').eq('status', 'pending').is('batch_id', null).range(from, to),
    ),
  ]);
  const activeOf = new Map(assigns.filter((a) => a.is_active).map((a) => [a.case_id, a.mentor_id]));
  const prior = (r: { case_id: string; mentor_id: string }) => activeOf.get(r.case_id) !== r.mentor_id;
  const roundRows = logs.filter(prior);
  const partialRows = partials.filter(prior);
  return {
    caseIds: Array.from(new Set([...roundRows, ...partialRows].map((r) => r.case_id))),
    unsettledRounds: roundRows.length,
    pendingPartials: partialRows.length,
  };
}
