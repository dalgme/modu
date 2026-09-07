import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { CASE_STATUSES, type CaseStatus } from '@/types/case-status';
import { SURVEY_OPEN_STATUSES } from '@/lib/workflow/mentee';

/**
 * 리포트·대시보드 수치 — **한 곳**에서 계산 (docs/MODU-DESIGN.md §19).
 * 대시보드 타일, 리포트 화면, 엑셀 내보내기가 모두 이 함수를 쓴다. 행사(+그룹) 범위, service_role + 코드 필터.
 */
export interface ProgramMetrics {
  scope: { programId: string; supportTypeId: string | null; generatedAt: string };
  performance: {
    cases: number;
    byStatus: Record<CaseStatus, number>;
    roundsDone: number;
    roundsPlanned: number;
    roundsCompleted: number; // 정산 확정된 회차
    closed: number;
    closureRate: number; // closed / cases
    onlineRounds: number;
    offlineRounds: number;
  };
  backlog: {
    unassigned: number;
    remainingRounds: number;
    stalled: number; // 진행 중인데 최근 N일 회차 없음
    stalledDays: number;
    reviewPending: number;
    revisionRequested: number;
    reassignmentPending: number;
    unsignedRounds: number;
    unansweredSurveys: number;
    mentorsMissingDocs: number;
    pendingRequests: number;
  };
  evaluation: {
    surveyAvg: number | null;
    surveyResponses: number;
    surveyByGroup: { id: string; name: string; avg: number | null; n: number }[];
    surveyByMentor: { id: string; name: string; avg: number | null; n: number }[];
    mentorReviewAvg: number | null;
    observationRate: number; // 종결 요청 이상 / 케이스
  };
  settlement: {
    estimatedGross: number; // 미정산 회차 금액 합 (예상, 세전)
    pendingNet: number;
    batchedNet: number;
    confirmedNet: number;
    paidNet: number;
    withholdingTotal: number;
    byMethod: { method: string; count: number; net: number }[];
  };
  groups: GroupMetric[];
  mentors: MentorMetric[];
}

export interface GroupMetric {
  id: string;
  code: string;
  name: string;
  status: string;
  requiredRounds: number;
  cases: number;
  byStatus: Record<CaseStatus, number>;
  roundsDone: number;
  roundsPlanned: number;
  closed: number;
  succeededFrom: number; // 승계로 들어온 케이스
  succeededTo: number; // 다음 그룹으로 승계된 케이스
  surveyAvg: number | null;
  settledNet: number;
}

export interface MentorMetric {
  id: string;
  name: string;
  cases: number;
  activeCases: number;
  roundsDone: number;
  roundsCompleted: number;
  online: number;
  offline: number;
  closed: number;
  settledNet: number;
  surveyAvg: number | null;
  reviewAvg: number | null;
}

const STALLED_DAYS = 14;

function emptyStatus(): Record<CaseStatus, number> {
  return Object.fromEntries(CASE_STATUSES.map((s) => [s, 0])) as Record<CaseStatus, number>;
}
function avg(list: number[]): number | null {
  return list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100 : null;
}

export async function computeProgramMetrics(programId: string, supportTypeId?: string | null): Promise<ProgramMetrics> {
  const admin = createAdminClient();
  const { data: groupsRaw } = await admin.from('support_types').select('id, code, name, status, required_rounds').eq('program_id', programId).order('sort_order');
  const groups = (groupsRaw ?? []).filter((g) => !supportTypeId || g.id === supportTypeId);
  const groupIds = groups.map((g) => g.id);
  let casesQ = admin.from('cases').select('id, support_type_id, status, predecessor_case_id, created_at').eq('program_id', programId);
  if (supportTypeId) casesQ = casesQ.eq('support_type_id', supportTypeId);
  const { data: casesRaw } = await casesQ;
  const cases = casesRaw ?? [];
  const caseIds = cases.map((c) => c.id);
  const inScope = new Set(caseIds);

  const [logsR, settR, respR, assignR, extR, chgR, wdR, docsR, reviewsR, extraR, succR, membersR] = caseIds.length
    ? await Promise.all([
        admin.from('mentoring_logs').select('id, case_id, mentor_id, mode, amount_snapshot, settlement_id, started_at, mentee_signed_at').in('case_id', caseIds),
        admin.from('settlements').select('case_id, mentor_id, status, net, withholding, withholding_method').in('case_id', caseIds).neq('status', 'canceled'),
        admin.from('survey_responses').select('case_id, score').in('case_id', caseIds),
        admin.from('mentor_assignments').select('case_id, mentor_id, is_active').in('case_id', caseIds),
        admin.from('round_extension_requests').select('id').in('case_id', caseIds).eq('status', 'pending'),
        admin.from('mentor_change_requests').select('id').in('case_id', caseIds).eq('status', 'pending'),
        admin.from('mentor_withdrawal_requests').select('id').in('case_id', caseIds).eq('status', 'pending'),
        admin.from('mentor_payment_docs').select('user_id, resume_received_at, bankbook_received_at, id_card_received_at').eq('program_id', programId),
        admin.from('mentor_group_reviews').select('mentor_id, rating').eq('program_id', programId).is('deleted_at', null),
        admin.from('round_extension_requests').select('case_id, extra_rounds').in('case_id', caseIds).eq('status', 'approved'),
        admin.from('cases').select('id, predecessor_case_id').eq('program_id', programId).in('predecessor_case_id', caseIds),
        admin.from('program_members').select('user_id').eq('program_id', programId).eq('is_active', true),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const logs = (logsR.data ?? []) as { id: string; case_id: string; mentor_id: string; mode: string; amount_snapshot: number; settlement_id: string | null; started_at: string; mentee_signed_at: string | null }[];
  const settlements = (settR.data ?? []) as { case_id: string; mentor_id: string; status: string; net: number; withholding: number; withholding_method: string }[];
  const responses = (respR.data ?? []) as { case_id: string; score: number | null }[];
  const assigns = (assignR.data ?? []) as { case_id: string; mentor_id: string; is_active: boolean }[];
  const extras = (extraR.data ?? []) as { case_id: string; extra_rounds: number }[];
  const succ = (succR.data ?? []) as { id: string; predecessor_case_id: string | null }[];
  const reviews = (reviewsR.data ?? []) as { mentor_id: string; rating: number | null }[];

  const groupOf = new Map(cases.map((c) => [c.id, c.support_type_id]));
  const requiredOf = new Map(groups.map((g) => [g.id, g.required_rounds]));
  const extraOf = new Map<string, number>();
  for (const e of extras) extraOf.set(e.case_id, (extraOf.get(e.case_id) ?? 0) + e.extra_rounds);
  const plannedOf = (caseId: string) => (requiredOf.get(groupOf.get(caseId) ?? '') ?? 0) + (extraOf.get(caseId) ?? 0);
  const logsByCase = new Map<string, typeof logs>();
  for (const l of logs) logsByCase.set(l.case_id, [...(logsByCase.get(l.case_id) ?? []), l]);
  const scoreByCase = new Map(responses.map((r) => [r.case_id, r.score]));

  // ---- performance
  const byStatus = emptyStatus();
  for (const c of cases) byStatus[c.status as CaseStatus] += 1;
  const roundsPlanned = cases.filter((c) => c.status !== 'withdrawn').reduce((a, c) => a + plannedOf(c.id), 0);
  const closed = byStatus.closed;

  // ---- backlog
  const now = Date.now();
  const stalled = cases.filter((c) => {
    if (c.status !== 'in_progress' && c.status !== 'mentor_assigned') return false;
    const last = (logsByCase.get(c.id) ?? []).reduce((m, l) => Math.max(m, new Date(l.started_at).getTime()), 0);
    const ref = last || new Date(c.created_at).getTime();
    return now - ref > STALLED_DAYS * 86400000;
  }).length;
  const remainingRounds = cases.filter((c) => !['closed', 'withdrawn'].includes(c.status)).reduce((a, c) => a + Math.max(0, plannedOf(c.id) - (logsByCase.get(c.id)?.length ?? 0)), 0);
  const unansweredSurveys = cases.filter((c) => (SURVEY_OPEN_STATUSES as readonly string[]).includes(c.status) && !scoreByCase.has(c.id)).length;
  const mentorIds = new Set(assigns.map((a) => a.mentor_id));
  const docsComplete = new Set((docsR.data ?? []).filter((d: { resume_received_at: string | null; bankbook_received_at: string | null; id_card_received_at: string | null }) => d.resume_received_at && d.bankbook_received_at && d.id_card_received_at).map((d: { user_id: string }) => d.user_id));
  const mentorsMissingDocs = Array.from(mentorIds).filter((m) => !docsComplete.has(m)).length;

  // ---- evaluation
  const scores = responses.map((r) => r.score).filter((s): s is number => typeof s === 'number');
  const activeMentorOf = new Map<string, string>();
  for (const a of assigns) if (a.is_active) activeMentorOf.set(a.case_id, a.mentor_id);
  const lastMentorOf = new Map<string, string>(); // 활성 없으면 마지막 배정
  for (const a of assigns) if (!activeMentorOf.has(a.case_id)) lastMentorOf.set(a.case_id, a.mentor_id);
  const mentorOfCase = (caseId: string) => activeMentorOf.get(caseId) ?? lastMentorOf.get(caseId) ?? null;
  const mentorUserIds = Array.from(new Set([...assigns.map((a) => a.mentor_id), ...logs.map((l) => l.mentor_id), ...settlements.map((s) => s.mentor_id)]));
  const { data: mentorUsers } = mentorUserIds.length ? await admin.from('users').select('id, name').in('id', mentorUserIds) : { data: [] as { id: string; name: string }[] };
  const mentorName = new Map((mentorUsers ?? []).map((u) => [u.id, u.name]));
  const surveyByMentor = Array.from(mentorUserIds).map((mid) => {
    const list = responses.filter((r) => mentorOfCase(r.case_id) === mid && typeof r.score === 'number').map((r) => r.score as number);
    return { id: mid, name: mentorName.get(mid) ?? '-', avg: avg(list), n: list.length };
  });
  const surveyByGroup = groups.map((g) => {
    const list = responses.filter((r) => groupOf.get(r.case_id) === g.id && typeof r.score === 'number').map((r) => r.score as number);
    return { id: g.id, name: g.name, avg: avg(list), n: list.length };
  });
  const observationRate = cases.length ? cases.filter((c) => ['closure_requested', 'revision_requested', 'settlement_pending', 'settlement_batched', 'closed'].includes(c.status)).length / cases.length : 0;

  // ---- settlement
  const sumNet = (status: string) => settlements.filter((s) => s.status === status).reduce((a, s) => a + Number(s.net), 0);
  const byMethodMap = new Map<string, { count: number; net: number }>();
  for (const s of settlements) {
    const m = byMethodMap.get(s.withholding_method) ?? { count: 0, net: 0 };
    m.count += 1;
    m.net += Number(s.net);
    byMethodMap.set(s.withholding_method, m);
  }

  // ---- groups
  const groupMetrics: GroupMetric[] = groups.map((g) => {
    const gc = cases.filter((c) => c.support_type_id === g.id);
    const st = emptyStatus();
    for (const c of gc) st[c.status as CaseStatus] += 1;
    const gcIds = new Set(gc.map((c) => c.id));
    const gLogs = logs.filter((l) => gcIds.has(l.case_id));
    const gScores = responses.filter((r) => gcIds.has(r.case_id) && typeof r.score === 'number').map((r) => r.score as number);
    return {
      id: g.id,
      code: g.code,
      name: g.name,
      status: g.status,
      requiredRounds: g.required_rounds,
      cases: gc.length,
      byStatus: st,
      roundsDone: gLogs.length,
      roundsPlanned: gc.filter((c) => c.status !== 'withdrawn').reduce((a, c) => a + plannedOf(c.id), 0),
      closed: st.closed,
      succeededFrom: gc.filter((c) => c.predecessor_case_id).length,
      succeededTo: succ.filter((s) => s.predecessor_case_id && gcIds.has(s.predecessor_case_id)).length,
      surveyAvg: avg(gScores),
      settledNet: settlements.filter((s) => gcIds.has(s.case_id)).reduce((a, s) => a + Number(s.net), 0),
    };
  });

  // ---- mentors
  const mentorMetrics: MentorMetric[] = mentorUserIds
    .map((mid) => {
      const myAssigns = assigns.filter((a) => a.mentor_id === mid);
      const myCases = new Set(myAssigns.map((a) => a.case_id));
      const myLogs = logs.filter((l) => l.mentor_id === mid);
      const ratings = reviews.filter((r) => r.mentor_id === mid && typeof r.rating === 'number').map((r) => r.rating as number);
      return {
        id: mid,
        name: mentorName.get(mid) ?? '-',
        cases: myCases.size,
        activeCases: myAssigns.filter((a) => a.is_active).length,
        roundsDone: myLogs.length,
        roundsCompleted: myLogs.filter((l) => l.settlement_id).length,
        online: myLogs.filter((l) => l.mode === 'online').length,
        offline: myLogs.filter((l) => l.mode === 'offline').length,
        closed: cases.filter((c) => myCases.has(c.id) && c.status === 'closed' && mentorOfCase(c.id) === mid).length,
        settledNet: settlements.filter((s) => s.mentor_id === mid).reduce((a, s) => a + Number(s.net), 0),
        surveyAvg: surveyByMentor.find((s) => s.id === mid)?.avg ?? null,
        reviewAvg: avg(ratings),
      };
    })
    .sort((a, b) => b.roundsDone - a.roundsDone || a.name.localeCompare(b.name, 'ko'));

  void groupIds;
  void membersR;
  return {
    scope: { programId, supportTypeId: supportTypeId ?? null, generatedAt: new Date().toISOString() },
    performance: {
      cases: cases.length,
      byStatus,
      roundsDone: logs.length,
      roundsPlanned,
      roundsCompleted: logs.filter((l) => l.settlement_id).length,
      closed,
      closureRate: cases.length ? closed / cases.length : 0,
      onlineRounds: logs.filter((l) => l.mode === 'online').length,
      offlineRounds: logs.filter((l) => l.mode === 'offline').length,
    },
    backlog: {
      unassigned: byStatus.registered,
      remainingRounds,
      stalled,
      stalledDays: STALLED_DAYS,
      reviewPending: byStatus.closure_requested,
      revisionRequested: byStatus.revision_requested,
      reassignmentPending: byStatus.reassignment_pending,
      unsignedRounds: logs.filter((l) => !l.mentee_signed_at && inScope.has(l.case_id)).length,
      unansweredSurveys,
      mentorsMissingDocs,
      pendingRequests: (extR.data ?? []).length + (chgR.data ?? []).length + (wdR.data ?? []).length,
    },
    evaluation: {
      surveyAvg: avg(scores),
      surveyResponses: responses.length,
      surveyByGroup,
      surveyByMentor: surveyByMentor.filter((s) => s.n > 0).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)),
      mentorReviewAvg: avg(reviews.map((r) => r.rating).filter((x): x is number => typeof x === 'number')),
      observationRate,
    },
    settlement: {
      estimatedGross: logs.filter((l) => !l.settlement_id).reduce((a, l) => a + Number(l.amount_snapshot), 0),
      pendingNet: sumNet('pending'),
      batchedNet: sumNet('batched'),
      confirmedNet: sumNet('confirmed'),
      paidNet: sumNet('paid'),
      withholdingTotal: settlements.reduce((a, s) => a + Number(s.withholding), 0),
      byMethod: Array.from(byMethodMap.entries()).map(([method, v]) => ({ method, ...v })),
    },
    groups: groupMetrics,
    mentors: mentorMetrics,
  };
}
