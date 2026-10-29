/**
 * 케이스(멘티) 진행 단계 v2 — docs/MODU-DESIGN.md §3.
 *
 * DB enum `case_status`(0048) 와 1:1. 값을 추가·삭제하면 마이그레이션도 함께 바꾼다.
 * 전이 규칙(누가 어디서 어디로)은 `src/lib/workflow/transitions.ts` 한 곳에 있고,
 * 화면 버튼과 서버 액션이 그 상수를 같이 읽는다.
 *
 * 라벨 문구의 `{client}` `{operator}` 는 행사 설정의 발주처·용역사 약칭으로 치환된다
 * (`src/lib/programs/branding.ts` 의 `fmt()`). 기관명 리터럴을 여기 쓰지 말 것.
 */
export const CASE_STATUSES = [
  'registered',
  'mentor_assigned',
  'in_progress',
  'reassignment_pending',
  'closure_requested',
  'revision_requested',
  'settlement_pending',
  'settlement_batched',
  'closed',
  'withdrawn',
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

/** 상태 톤 — 배지·타임라인 색상 그룹 (대기/진행/승인/반려) */
export type StatusTone = 'pending' | 'progress' | 'approved' | 'rejected';

interface StatusMeta {
  /** 진행바 단계 번호 (1~7). 정규 단계가 아닌 종결 상태(중도 종료)는 0. */
  step: number;
  /** 한글 라벨 템플릿 (`{client}` `{operator}` 플레이스홀더 허용) */
  label: string;
  /** 짧은 라벨 (배지·차트) */
  short: string;
  tone: StatusTone;
}

export const CASE_STATUS_META: Record<CaseStatus, StatusMeta> = {
  registered: { step: 1, label: '멘티 등록', short: '등록', tone: 'pending' },
  mentor_assigned: { step: 2, label: '멘토 배정', short: '배정', tone: 'progress' },
  in_progress: { step: 3, label: '컨설팅 진행 중', short: '진행 중', tone: 'progress' },
  // 멘토 중도 종료 → 재배정 대기. 3단계에 반려 톤으로 표시.
  reassignment_pending: { step: 3, label: '멘토 재배정 대기', short: '재배정 대기', tone: 'rejected' },
  closure_requested: { step: 4, label: '종결 요청(관찰의견서 제출)', short: '종결 요청', tone: 'progress' },
  // {operator} 보완 요청 → 멘토 수정 후 재요청. 4단계에 반려 톤.
  revision_requested: { step: 4, label: '{operator} 보완 요청', short: '보완 요청', tone: 'rejected' },
  settlement_pending: { step: 5, label: '{operator} 검수 완료 · 지급 대기', short: '지급 대기', tone: 'approved' },
  settlement_batched: { step: 6, label: '지급 품의 편성', short: '품의 편성', tone: 'progress' },
  closed: { step: 7, label: '{client} 정산 확인 · 종결', short: '종결', tone: 'approved' },
  withdrawn: { step: 0, label: '중도 종료', short: '중도 종료', tone: 'rejected' },
};

/** 진행바 정규 7단계 순서 (접힌 상태 reassignment_pending·revision_requested 는 포함하지 않는다) */
export const CASE_STEP_ORDER: CaseStatus[] = [
  'registered',
  'mentor_assigned',
  'in_progress',
  'closure_requested',
  'settlement_pending',
  'settlement_batched',
  'closed',
];

/** 종결(더 이상 전이 없음) 상태 */
export const TERMINAL_STATUSES: CaseStatus[] = ['closed', 'withdrawn'];

/** 컨설팅(회차 등록)이 가능한 상태 */
export const ROUND_EDITABLE_STATUSES: CaseStatus[] = [
  'mentor_assigned',
  'in_progress',
  'revision_requested',
];

/** 정산 확정(스냅샷 저장) 이후 — 회차는 잠긴다 */
export const SETTLED_STATUSES: CaseStatus[] = ['settlement_pending', 'settlement_batched', 'closed'];

export function statusStep(status: CaseStatus): number {
  return CASE_STATUS_META[status].step;
}

export function isTerminal(status: CaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isCaseStatus(value: unknown): value is CaseStatus {
  return typeof value === 'string' && (CASE_STATUSES as readonly string[]).includes(value);
}
