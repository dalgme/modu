/** 지연 관리 상수·타입 (P22) — 서버(감지 로직)와 클라이언트(목록 UI)가 공용으로 쓴다. */

export const DELAY_DAYS = {
  unassigned: 7,
  reassign: 7,
  no_round: 14,
  stalled: 21,
  revision: 7,
} as const;

export type DelayKind = keyof typeof DELAY_DAYS;

export const DELAY_LABELS: Record<DelayKind, string> = {
  unassigned: `배정 지연 (등록 후 ${DELAY_DAYS.unassigned}일↑)`,
  reassign: `재배정 지연 (대기 ${DELAY_DAYS.reassign}일↑)`,
  no_round: `첫 회차 없음 (배정 후 ${DELAY_DAYS.no_round}일↑)`,
  stalled: `장기 무진행 (마지막 활동 후 ${DELAY_DAYS.stalled}일↑)`,
  revision: `보완 지연 (요청 후 ${DELAY_DAYS.revision}일↑)`,
};

export interface DelayedCase {
  caseId: string;
  kind: DelayKind;
  days: number;
  ownerName: string;
  businessName: string;
  groupName: string | null;
  status: string;
  mentorId: string | null;
  mentorName: string | null;
  /** (P31) 지연 목록 전화·문자 아이콘 */
  mentorPhone?: string | null;
  roundsDone: number;
  requiredRounds: number;
}
