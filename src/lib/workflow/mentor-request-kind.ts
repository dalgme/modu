/**
 * 멘토 요청 분류 (2026-11-17) — 화면·서버 공용 중립 파일.
 *  - reassign      = 멘토 변경 요청 → 승인 시 이행 회차 부분 정산 + 재배정 대기
 *  - early_closure = 중도 종결 요청 → 승인 시 남은 회차 없이 검수 대기(등록된 회차까지로 검수·정산)
 * 요청함·대시보드 팝업의 탭: 멘토 변경(멘토의 reassign + 멘티의 멘토 변경 요청) / 중도 종결 / 추가 회차.
 */
export type MentorRequestKind = 'reassign' | 'early_closure';

export function normalizeMentorRequestKind(v: unknown): MentorRequestKind {
  return v === 'early_closure' ? 'early_closure' : 'reassign';
}

export const MENTOR_REQUEST_LABEL: Record<MentorRequestKind, string> = {
  reassign: '멘토 변경 요청',
  early_closure: '중도 종결 요청',
};

export type InboxGroup = 'change' | 'closure' | 'extension';
export const INBOX_GROUPS: { key: InboxGroup; label: string }[] = [
  { key: 'change', label: '멘토 변경' },
  { key: 'closure', label: '중도 종결' },
  { key: 'extension', label: '추가 회차' },
];

/** 요청함 항목 → 탭 */
export function inboxGroupOf(it: { kind: 'extension' | 'mentor_change' | 'mentor_withdrawal'; withdrawalKind?: MentorRequestKind | null }): InboxGroup {
  if (it.kind === 'extension') return 'extension';
  if (it.kind === 'mentor_withdrawal' && it.withdrawalKind === 'early_closure') return 'closure';
  return 'change';
}
