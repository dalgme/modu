/**
 * 회차별 진행 현황 (2026-11-03) — 리포트 [회차별 현황] 탭·엑셀 공용 계산. 서버·클라이언트 중립(순수 함수).
 *
 * 멘티(케이스) 분류 — 운영에서는 '포기'를 중도 종료(withdrawn)보다 회원 비활성화로 처리하는 경우가 많으므로 둘 다 포기로 본다.
 *  - ended        회차 진행 후 종료 = 검수 승인 이후(정산 대기·품의·종결)
 *  - gaveUpAfter  회차 진행 후 포기 = 중도 종료 또는 비활성화(행사 비활성화·계정 잠금) + 진행 완료 회차 1회 이상
 *  - gaveUpBefore 회차 진행 안 하고 포기 = 위와 같으나 진행 완료 회차 0회
 *  - ongoing      진행 중(위 셋이 아님) — 멘토 미배정 포함
 *
 * 회차 N 기준 (진행 완료 = 그 회차의 종료 시각이 지금 이전):
 *  - 일정 등록 = N회차 일정이 있는 멘티(종료·포기 멘티 포함)
 *  - 일정 미등록 = 진행 중 멘티 중 N회차 일정이 없는 멘티 — 종료·포기 멘티는 제외
 *    → 일정 등록 + 일정 미등록 + 제외 = 전체 멘티
 *  - 진행 완료 / 진행 미완료(진행 중 멘티 중 N회차가 아직 완료되지 않은 멘티 = 예정 + 미등록)
 *  - 보고서 등록 = N회차 보고서가 등록된 멘티, 보고서 대기 = 진행 완료됐는데 보고서가 없는 멘티
 */

export type RoundProgressCategory = 'ongoing' | 'ended' | 'gaveUpAfter' | 'gaveUpBefore';

export const ROUND_PROGRESS_CATEGORY_LABELS: Record<RoundProgressCategory, string> = {
  ongoing: '진행 중',
  ended: '회차 진행 후 종료',
  gaveUpAfter: '회차 진행 후 포기',
  gaveUpBefore: '회차 진행 안 하고 포기',
};

/** 검수 승인 이후 = 정상 종료 */
const ENDED_STATUSES = new Set(['settlement_pending', 'settlement_batched', 'closed']);

export interface RPGroupInput {
  id: string;
  name: string;
  requiredRounds: number;
}

export interface RPCaseInput {
  id: string;
  groupId: string;
  status: string;
  menteeName: string;
  businessName?: string | null;
  /** 행사 비활성화 또는 계정 잠금 */
  inactive: boolean;
  /** 현재 담당(활성 배정) 멘토 */
  activeMentorId: string | null;
  /** 끝까지 담당한 멘토(종결·중도 종료로 끝난 배정) */
  finalMentorIds?: string[];
}

export interface RPLogInput {
  caseId: string;
  roundNo: number;
  startedAt: string;
  endedAt: string | null;
  reportAt: string | null;
  mentorId: string | null;
}

export interface RoundRow {
  roundNo: number;
  /** 그룹 회차 수를 넘는 추가 회차 — 미등록·미완료는 계산하지 않는다 */
  extra: boolean;
  registered: number;
  unregistered: number | null;
  /** 일정 기준 제외 = 종료·포기 멘티 중 이 회차 일정이 없는 수 */
  excludedRegistration: number;
  completed: number;
  notCompleted: number | null;
  /** 진행 미완료 중 일정은 등록된(예정) 수 */
  notCompletedScheduled: number | null;
  /** 진행 완료 기준 제외 = 종료·포기 멘티 중 이 회차가 완료되지 않은 수 */
  excludedCompletion: number;
  reports: number;
  /** 진행 완료됐는데 보고서가 없는 수 (종료·포기 포함) */
  reportPending: number;
}

export interface RPCaseResult {
  id: string;
  groupId: string;
  menteeName: string;
  businessName: string | null;
  status: string;
  inactive: boolean;
  category: RoundProgressCategory;
  /** 진행 완료 회차 수 */
  completedRounds: number;
  reportRounds: number;
}

export interface RoundProgressSummary {
  total: number;
  ongoing: number;
  /** 진행 중 멘티 중 멘토 미배정 */
  ongoingUnassigned: number;
  ended: number;
  gaveUpAfter: number;
  gaveUpBefore: number;
  /** 진행 멘티 = 전체 − 회차 진행 안 하고 포기 */
  participatingMentees: number;
  /** 진행 멘토 = 진행 멘티(위)를 맡았거나 회차를 진행한 멘토 */
  participatingMentors: number;
  /** 지금 진행 중 멘티를 맡고 있는 멘토 */
  currentMentors: number;
}

export interface GroupRoundProgress {
  id: string;
  name: string;
  requiredRounds: number;
  rounds: RoundRow[];
  summary: RoundProgressSummary;
}

export interface RoundProgressResult {
  groups: GroupRoundProgress[];
  summary: RoundProgressSummary;
  cases: RPCaseResult[];
}

function isDone(l: RPLogInput, nowMs: number): boolean {
  const t = Date.parse(l.endedAt ?? l.startedAt);
  return Number.isFinite(t) && t <= nowMs;
}

export function classifyCase(c: Pick<RPCaseInput, 'status' | 'inactive'>, completedRounds: number): RoundProgressCategory {
  if (ENDED_STATUSES.has(c.status)) return 'ended';
  if (c.status === 'withdrawn' || c.inactive) return completedRounds > 0 ? 'gaveUpAfter' : 'gaveUpBefore';
  return 'ongoing';
}

function summarize(cases: RPCaseResult[], inputs: Map<string, RPCaseInput>, logsByCase: Map<string, RPLogInput[]>): RoundProgressSummary {
  const s: RoundProgressSummary = { total: cases.length, ongoing: 0, ongoingUnassigned: 0, ended: 0, gaveUpAfter: 0, gaveUpBefore: 0, participatingMentees: 0, participatingMentors: 0, currentMentors: 0 };
  const participating = new Set<string>();
  const current = new Set<string>();
  for (const c of cases) {
    s[c.category] += 1;
    const input = inputs.get(c.id)!;
    if (c.category === 'ongoing' && !input.activeMentorId) s.ongoingUnassigned += 1;
    if (c.category === 'gaveUpBefore') continue;
    s.participatingMentees += 1;
    if (input.activeMentorId) participating.add(input.activeMentorId);
    for (const m of input.finalMentorIds ?? []) participating.add(m);
    for (const l of logsByCase.get(c.id) ?? []) if (l.mentorId) participating.add(l.mentorId);
    if (c.category === 'ongoing' && input.activeMentorId) current.add(input.activeMentorId);
  }
  s.participatingMentors = participating.size;
  s.currentMentors = current.size;
  return s;
}

/** 회차별 진행 현황 계산 — 화면·엑셀이 같은 함수를 쓴다. now = 진행 완료 판정 기준 시각 */
export function computeRoundProgress(input: { groups: RPGroupInput[]; cases: RPCaseInput[]; logs: RPLogInput[]; now: Date }): RoundProgressResult {
  const nowMs = input.now.getTime();
  const logsByCase = new Map<string, RPLogInput[]>();
  for (const l of input.logs) {
    const arr = logsByCase.get(l.caseId) ?? [];
    arr.push(l);
    logsByCase.set(l.caseId, arr);
  }
  const inputs = new Map(input.cases.map((c) => [c.id, c]));
  const caseResults: RPCaseResult[] = input.cases.map((c) => {
    const logs = logsByCase.get(c.id) ?? [];
    const completedRounds = new Set(logs.filter((l) => isDone(l, nowMs)).map((l) => l.roundNo)).size;
    const reportRounds = new Set(logs.filter((l) => !!l.reportAt).map((l) => l.roundNo)).size;
    return { id: c.id, groupId: c.groupId, menteeName: c.menteeName, businessName: c.businessName ?? null, status: c.status, inactive: c.inactive, category: classifyCase(c, completedRounds), completedRounds, reportRounds };
  });

  const groups: GroupRoundProgress[] = input.groups
    .map((g) => {
      const gCases = caseResults.filter((c) => c.groupId === g.id);
      let maxRound = g.requiredRounds;
      for (const c of gCases) for (const l of logsByCase.get(c.id) ?? []) maxRound = Math.max(maxRound, l.roundNo);
      const rounds: RoundRow[] = [];
      for (let n = 1; n <= maxRound; n += 1) {
        const extra = n > g.requiredRounds;
        const row: RoundRow = { roundNo: n, extra, registered: 0, unregistered: extra ? null : 0, excludedRegistration: 0, completed: 0, notCompleted: extra ? null : 0, notCompletedScheduled: extra ? null : 0, excludedCompletion: 0, reports: 0, reportPending: 0 };
        for (const c of gCases) {
          const logs = (logsByCase.get(c.id) ?? []).filter((l) => l.roundNo === n);
          const has = logs.length > 0;
          const done = logs.some((l) => isDone(l, nowMs));
          const reported = logs.some((l) => !!l.reportAt);
          const terminated = c.category !== 'ongoing';
          if (has) row.registered += 1;
          else if (terminated) row.excludedRegistration += 1;
          else if (!extra) row.unregistered! += 1;
          if (done) row.completed += 1;
          else if (terminated) row.excludedCompletion += 1;
          else if (!extra) {
            row.notCompleted! += 1;
            if (has) row.notCompletedScheduled! += 1;
          }
          if (reported) row.reports += 1;
          else if (done) row.reportPending += 1;
        }
        rounds.push(row);
      }
      return { id: g.id, name: g.name, requiredRounds: g.requiredRounds, rounds, summary: summarize(gCases, inputs, logsByCase) };
    })
    .filter((g) => g.summary.total > 0 || input.groups.length === 1);

  return { groups, summary: summarize(caseResults, inputs, logsByCase), cases: caseResults };
}
