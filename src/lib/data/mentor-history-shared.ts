/**
 * 멘토의 끝난 멘토링 내역 — 화면·서버·테스트 공용 (2026-11-25).
 */
export interface MentorHistoryItem {
  caseId: string;
  menteeName: string;
  groupName: string | null;
  caseStatus: string;
  /** 이 멘토 배정이 끝난 이유 — case_closed 종결 / case_withdrawn 멘티 중도 종료 / mentor_withdrawal 멘토 변경·중도 종결 요청 승인 / reassigned 재배정 / forced 운영사 종료 / recalled 회수 */
  endKind: string | null;
  endedAt: string | null;
  canOpenCase: boolean;
  rounds: { roundNo: number; startedAt: string; endedAt: string; mode: 'online' | 'offline'; reported: boolean; amount: number; settled: boolean }[];
  settlements: { kind: string; status: string; net: number; gross: number; paidAt: string | null }[];
  status: MentorHistoryStatus;
}

export type MentorHistoryStatus = 'paid' | 'confirmed' | 'batched' | 'pending' | 'none';

export const MENTOR_HISTORY_STATUS_LABEL: Record<MentorHistoryStatus, string> = {
  paid: '정산 완료 · 지급 완료',
  confirmed: '정산 완료 · 지급 대기',
  batched: '정산 확정 · 품의 진행',
  pending: '정산 확정 · 품의 전',
  none: '정산 전',
};

/** 이 멘토의 정산들 중 가장 덜 진행된 단계를 대표로 — 하나라도 남은 단계가 있으면 그 단계로 보인다 */
export function mentorHistoryStatus(statuses: string[]): MentorHistoryStatus {
  if (statuses.length === 0) return 'none';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('batched')) return 'batched';
  if (statuses.includes('confirmed')) return 'confirmed';
  return 'paid';
}

export const END_KIND_LABEL: Record<string, string> = {
  case_closed: '종결',
  case_withdrawn: '멘티 중도 종료',
  mentor_withdrawal: '멘토 변경·중도 종결',
  reassigned: '멘토 교체',
  forced: '운영사 종료',
  recalled: '배정 회수',
};
