/**
 * 멘토링 결과 구분 (2026-11-03, 0095) — 운영사가 회원 명단 > 멘티 > [정보 수정]에서 케이스마다 표시한다.
 * 상태머신·정산과 무관한 표시값이다. 리포트 [회차별 현황]은 이 값을 중도 종료·비활성화 추정보다 우선한다.
 * 서버·클라이언트 공용 중립 파일.
 */
export const MENTORING_OUTCOMES = ['gave_up', 'ended'] as const;
export type MentoringOutcome = (typeof MENTORING_OUTCOMES)[number];

export const MENTORING_OUTCOME_LABELS: Record<MentoringOutcome, string> = {
  gave_up: '멘토링 포기',
  ended: '멘토링 종료',
};

export function normalizeMentoringOutcome(v: unknown): MentoringOutcome | null {
  return v === 'gave_up' || v === 'ended' ? v : null;
}

/** 회원 명단 편집 패널에서 보여 줄 멘티의 케이스(라운드) 한 건 */
export interface MentoringCaseItem {
  caseId: string;
  groupName: string | null;
  statusLabel: string;
  /** 보고서까지 등록된 회차 수 */
  roundsDone: number;
  requiredRounds: number;
  outcome: MentoringOutcome | null;
}
