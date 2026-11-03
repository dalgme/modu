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

/**
 * 화면 표시 이름 (2026-11-03) — 멘토링을 1회 이상 진행한 뒤면 '중도 포기'·'중도 종료'(비활성화하지 않고 멘토 화면에 남는다),
 * 진행 없이 포기·종료면 '멘토링 포기'·'멘토링 종료'. 진행 회차 = 보고서 등록 또는 종료 시각 경과.
 */
export function mentoringOutcomeLabel(outcome: MentoringOutcome | null | undefined, progressedRounds: number): string | null {
  if (!outcome) return null;
  if (progressedRounds >= 1) return outcome === 'gave_up' ? '중도 포기' : '중도 종료';
  return MENTORING_OUTCOME_LABELS[outcome];
}

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
  /** 진행 회차 수 (보고서 등록 또는 종료 시각 경과) — 표시 이름 결정 */
  progressedRounds: number;
  requiredRounds: number;
  outcome: MentoringOutcome | null;
}
