import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { CASE_STATUSES, type CaseStatus } from '@/types/case-status';
import { SURVEY_OPEN_STATUSES } from '@/lib/workflow/mentee';
import { DELAY_DAYS } from '@/lib/reports/delays-shared';

/**
 * 리포트·대시보드 수치 — **한 곳**에서 계산 (docs/MODU-DESIGN.md §19).
 * 대시보드 타일, 리포트 화면, 엑셀 내보내기가 모두 이 함수를 쓴다. 행사(+그룹) 범위, service_role + 코드 필터.
 */
/** 리포트 기간 (KST 날짜, 양끝 포함). 회차 = 보고서 등록일, 정산 = 확정일, 케이스 신규/종결 = 등록일/종결일 기준 (P30) */
export interface ReportPeriod {
  from?: string | null;
  to?: string | null;
}

/** 기간 안인가 — from/to 가 없으면 항상 true. ISO 시각을 KST 날짜로 바꿔 비교 */
export function inPeriod(iso: string | null | undefined, period?: ReportPeriod | null): boolean {
  if (!period || (!period.from && !period.to)) return true;
  if (!iso) return false;
  const day = new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (period.from && day < period.from) return false;
  if (period.to && day > period.to) return false;
  return true;
}

export function periodLabel(period?: ReportPeriod | null): string {
  if (!period || (!period.from && !period.to)) return '전체 기간';
  return `${period.from ?? '…'} ~ ${period.to ?? '…'}`;
}

/** (P31) 기간 필터의 귀속 기준 설명 — 화면·리포트가 그대로 표시한다 */
export const PERIOD_BASIS_NOTE = '기간 기준: 회차 = 보고서 등록일 · 신규/종결 케이스 = 등록일/종결일 · 정산 지급 대기 = 확정일 · 품의 편성 = 품의 제출일 · 정산 확인 = 발주처 확인일 · 지급 완료 = 지급일';

export interface ProgramMetrics {
  scope: { programId: string; supportTypeId: string | null; generatedAt: string; period?: ReportPeriod | null; /** 기간 귀속 기준 설명 (P31) */ note?: string };
  performance: {
    cases: number;
    /** 기간 내 신규 등록 케이스 (기간 없으면 = cases) */
    newCases: number;
    /** 기간 내 종결(closed_at) 케이스 (기간 없으면 = closed) */
    closedCases: number;
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
  succeededFrom: number; // 승계로 들어온 케이스 (이전 케이스가 수료·진행)
  succeededTo: number; // 다음 그룹으로 승계된 케이스
  relocatedFrom: number; // 재배치로 들어온 케이스 (이전 케이스가 중도 종료)
  relocatedTo: number; // 중도 종료 후 다른 그룹에 재배치된 케이스
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

// 정체 기준일은 지연 관리(delays-shared)와 같은 상수 (P31 — 리포트 14일 / 지연 21일로 갈리던 문제)
const STALLED_DAYS = DELAY_DAYS.stalled;

type SettlementRow = { case_id: string; mentor_id: string; status: string; net: number; withholding: number; withholding_method: string; confirmed_at: string | null; created_at: string; paid_at: string | null; batch_id: string | null };

function emptyStatus(): Record<CaseStatus, number> {
  return Object.fromEntries(CASE_STATUSES.map((s) => [s, 0])) as Record<CaseStatus, number>;
}
function avg(list: number[]): number | null {
  return list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100 : null;
}

export async function computeProgramMetrics(programId: string, supportTypeId?: string | null, period?: ReportPeriod | null): Promise<ProgramMetrics> {
  const admin = createAdminClient();
  const hasPeriod = !!(period && (period.from || period.to));
  const { data: groupsRaw } = await admin.from('support_types').select('id, code, name, status, required_rounds').eq('program_id', programId).order('sort_order');
  const groups = (groupsRaw ?? []).filter((g) => !supportTypeId || g.id === supportTypeId);
  const groupIds = groups.map((g) => g.id);
  let casesQ = admin.from('cases').select('id, support_type_id, status, predecessor_case_id, created_at, closed_at').eq('program_id', programId);
  if (supportTypeId) casesQ = casesQ.eq('support_type_id', supportTypeId);
  const { data: casesRaw } = await casesQ;
  const cases = casesRaw ?? [];
  const caseIds = cases.map((c) => c.id);
  const inScope = new Set(caseIds);

  // 회차·정산·응답·배정은 1,000행 캡을 넘을 수 있어 페이지로 읽는다 (P30)
  const [logsAll, settlementsAll, responsesAll, assignsAll, extR, chgR, wdR, docsR, reviewsR, extraR, succR, membersR] = caseIds.length
    ? await Promise.all([
        fetchAllIn<{ id: string; case_id: string; mentor_id: string; mode: string; amount_snapshot: number; settlement_id: string | null; started_at: string; mentee_signed_at: string | null; report_registered_at: string | null }>(caseIds, (chunk, from, to) =>
          admin.from('mentoring_logs').select('id, case_id, mentor_id, mode, amount_snapshot, settlement_id, started_at, mentee_signed_at, report_registered_at').in('case_id', chunk).range(from, to),
        ),
        fetchAllIn<SettlementRow>(caseIds, (chunk, from, to) =>
          admin.from('settlements').select('case_id, mentor_id, status, net, withholding, withholding_method, confirmed_at, created_at, paid_at, batch_id').in('case_id', chunk).neq('status', 'canceled').range(from, to),
        ),
        fetchAllIn<{ case_id: string; score: number | null }>(caseIds, (chunk, from, to) => admin.from('survey_responses').select('case_id, score').in('case_id', chunk).range(from, to)),
        fetchAllIn<{ case_id: string; mentor_id: string; is_active: boolean; assigned_at: string }>(caseIds, (chunk, from, to) =>
          admin.from('mentor_assignments').select('case_id, mentor_id, is_active, assigned_at').in('case_id', chunk).order('assigned_at').range(from, to),
        ),
        // (P31) `.in()` 대상이 케이스 200개를 넘으면 URL 길이·1,000행 캡에 걸리므로 전부 fetchAllIn 으로
        fetchAllIn<{ id: string }>(caseIds, (chunk, from, to) => admin.from('round_extension_requests').select('id').in('case_id', chunk).eq('status', 'pending').range(from, to)).then((data) => ({ data })),
        fetchAllIn<{ id: string }>(caseIds, (chunk, from, to) => admin.from('mentor_change_requests').select('id').in('case_id', chunk).eq('status', 'pending').range(from, to)).then((data) => ({ data })),
        fetchAllIn<{ id: string }>(caseIds, (chunk, from, to) => admin.from('mentor_withdrawal_requests').select('id').in('case_id', chunk).eq('status', 'pending').range(from, to)).then((data) => ({ data })),
        admin.from('mentor_payment_docs').select('user_id, resume_state, bankbook_state, id_card_state').eq('program_id', programId),
        admin.from('mentor_group_reviews').select('mentor_id, rating').eq('program_id', programId).is('deleted_at', null),
        fetchAllIn<{ case_id: string; extra_rounds: number }>(caseIds, (chunk, from, to) => admin.from('round_extension_requests').select('case_id, extra_rounds').in('case_id', chunk).eq('status', 'approved').range(from, to)).then((data) => ({ data })),
        fetchAllIn<{ id: string; predecessor_case_id: string | null; status: string }>(caseIds, (chunk, from, to) => admin.from('cases').select('id, predecessor_case_id, status').eq('program_id', programId).in('predecessor_case_id', chunk).range(from, to)).then((data) => ({ data })),
        admin.from('program_members').select('user_id').eq('program_id', programId).eq('is_active', true),
      ])
    : [[], [], [], [], { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  // 이행 회차 = 보고서(2단계) 등록 회차만 (CLAUDE.md §3-1). 계획만 있는 회차는 roundsScheduled 로만 센다.
  const allLogs = logsAll as { id: string; case_id: string; mentor_id: string; mode: string; amount_snapshot: number; settlement_id: string | null; started_at: string; mentee_signed_at: string | null; report_registered_at: string | null }[];
  // 기간 필터 (P30): 회차 = 보고서 등록일, 정산 = 확정일(없으면 생성일)
  const logs = allLogs.filter((l) => l.report_registered_at && inPeriod(l.report_registered_at, period));
  const settlementRows = settlementsAll as SettlementRow[];
  const settlements = settlementRows.filter((st) => inPeriod(st.confirmed_at ?? st.created_at, period));
  // (P31) 단계별 금액은 각 단계의 귀속 시점으로 — 품의 편성 = 품의 제출일, 정산 확인 = 발주처 확인일, 지급 완료 = 지급일
  const batchIds = Array.from(new Set(settlementRows.map((st) => st.batch_id).filter((x): x is string => !!x)));
  const batchRows = await fetchAllIn<{ id: string; submitted_at: string | null; confirmed_at: string | null }>(batchIds, (chunk, from, to) => admin.from('settlement_batches').select('id, submitted_at, confirmed_at').in('id', chunk).range(from, to));
  const batchOf = new Map(batchRows.map((b) => [b.id, b]));
  const stageNet = (status: 'pending' | 'batched' | 'confirmed' | 'paid') =>
    settlementRows
      .filter((st) => st.status === status)
      .filter((st) => {
        if (!hasPeriod) return true;
        if (status === 'pending') return inPeriod(st.confirmed_at ?? st.created_at, period);
        if (status === 'paid') return inPeriod(st.paid_at, period);
        const b = st.batch_id ? batchOf.get(st.batch_id) : undefined;
        return inPeriod(status === 'batched' ? (b?.submitted_at ?? null) : (b?.confirmed_at ?? null), period);
      })
      .reduce((a, st) => a + Number(st.net), 0);
  const responses = responsesAll as { case_id: string; score: number | null }[];
  // assigned_at 오름차순 — "마지막 배정" 판정이 순서에 의존한다
  const assigns = assignsAll as { case_id: string; mentor_id: string; is_active: boolean; assigned_at: string }[];
  const extras = (extraR.data ?? []) as { case_id: string; extra_rounds: number }[];
  const succ = (succR.data ?? []) as { id: string; predecessor_case_id: string | null; status: string }[];
  // 승계 vs 재배치: 이전 케이스가 중도 종료(withdrawn)면 재배치 (P30)
  const predIds = Array.from(new Set(cases.map((c) => c.predecessor_case_id).filter((x): x is string => !!x)));
  const { data: preds } = predIds.length ? await admin.from('cases').select('id, status').in('id', predIds) : { data: [] as { id: string; status: string }[] };
  const predStatus = new Map((preds ?? []).map((p) => [p.id, p.status]));
  const statusOf = new Map(cases.map((c) => [c.id, c.status]));
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
  const newCases = hasPeriod ? cases.filter((c) => inPeriod(c.created_at, period)).length : cases.length;
  const closedCases = hasPeriod ? cases.filter((c) => c.status === 'closed' && inPeriod(c.closed_at, period)).length : closed;

  // ---- backlog
  const now = Date.now();
  const stalled = cases.filter((c) => {
    if (c.status !== 'in_progress' && c.status !== 'mentor_assigned') return false;
    // 미래 계획 회차가 '최근 활동'이 되지 않게 — 보고서 등록 시각 기준, 지금보다 뒤면 지금으로
    const last = (logsByCase.get(c.id) ?? []).reduce((m, l) => Math.max(m, Math.min(now, new Date(l.report_registered_at ?? l.started_at).getTime())), 0);
    const ref = last || new Date(c.created_at).getTime();
    return now - ref > STALLED_DAYS * 86400000;
  }).length;
  const remainingRounds = cases.filter((c) => !['closed', 'withdrawn'].includes(c.status)).reduce((a, c) => a + Math.max(0, plannedOf(c.id) - (logsByCase.get(c.id)?.length ?? 0)), 0);
  const unansweredSurveys = cases.filter((c) => (SURVEY_OPEN_STATUSES as readonly string[]).includes(c.status) && !scoreByCase.has(c.id)).length;
  const mentorIds = new Set(assigns.map((a) => a.mentor_id));
  // 지급서류 미수령 = 상태 X 가 하나라도 있는 멘토 ('-' 관리 안 함은 제외, P26)
  const docsMissing = new Set((docsR.data ?? []).filter((d: { resume_state: string | null; bankbook_state: string | null; id_card_state: string | null }) => [d.resume_state, d.bankbook_state, d.id_card_state].some((s) => s === 'X')).map((d: { user_id: string }) => d.user_id));
  const mentorsMissingDocs = Array.from(mentorIds).filter((m) => docsMissing.has(m)).length;

  // ---- evaluation
  const scores = responses.map((r) => r.score).filter((s): s is number => typeof s === 'number');
  const activeMentorOf = new Map<string, string>();
  for (const a of assigns) if (a.is_active) activeMentorOf.set(a.case_id, a.mentor_id);
  const lastMentorOf = new Map<string, string>(); // 활성 없으면 마지막 배정 (assigned_at 오름차순이라 마지막 대입이 최신)
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
      succeededFrom: gc.filter((c) => c.predecessor_case_id && predStatus.get(c.predecessor_case_id) !== 'withdrawn').length,
      succeededTo: succ.filter((s) => s.predecessor_case_id && gcIds.has(s.predecessor_case_id) && statusOf.get(s.predecessor_case_id) !== 'withdrawn').length,
      relocatedFrom: gc.filter((c) => c.predecessor_case_id && predStatus.get(c.predecessor_case_id) === 'withdrawn').length,
      relocatedTo: succ.filter((s) => s.predecessor_case_id && gcIds.has(s.predecessor_case_id) && statusOf.get(s.predecessor_case_id) === 'withdrawn').length,
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
    scope: { programId, supportTypeId: supportTypeId ?? null, generatedAt: new Date().toISOString(), period: hasPeriod ? { from: period?.from ?? null, to: period?.to ?? null } : null, note: hasPeriod ? PERIOD_BASIS_NOTE : undefined },
    performance: {
      cases: cases.length,
      newCases,
      closedCases,
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
      // 예상(미확정) = 보고서 등록됐고 아직 정산되지 않은 회차 — budget.ts 의 예상 집행액과 같은 조건
      estimatedGross: logs.filter((l) => !l.settlement_id).reduce((a, l) => a + Number(l.amount_snapshot), 0),
      pendingNet: stageNet('pending'),
      batchedNet: stageNet('batched'),
      confirmedNet: stageNet('confirmed'),
      paidNet: stageNet('paid'),
      withholdingTotal: settlements.reduce((a, s) => a + Number(s.withholding), 0),
      byMethod: Array.from(byMethodMap.entries()).map(([method, v]) => ({ method, ...v })),
    },
    groups: groupMetrics,
    mentors: mentorMetrics,
  };
}
