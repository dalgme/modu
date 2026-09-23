/** 매칭 관련 라벨·타입 — 서버·클라이언트 공용 (server-only 모듈에서 값을 import 하지 말 것). */

/** 매칭 방식 (P27-08): 자동(멘티 재배치 희망) / 추천(자동 추천 매칭 확정) / 수동(운영자 멘토 검색) */
export type MatchMethod = 'auto_preferred' | 'recommended' | 'manual';

export const MATCH_METHOD_LABELS: Record<MatchMethod, string> = {
  auto_preferred: '자동(멘티 희망)',
  recommended: '추천',
  manual: '수동',
};

/** 지급서류 셋트 상태 (P27-16): - 관리 안 함 / X 관리하지만 미수령 / O 수령 */
export type PaymentDocSetState = '-' | 'X' | 'O';
