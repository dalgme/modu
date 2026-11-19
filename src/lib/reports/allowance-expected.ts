/**
 * 멘토링 수당 산출내역의 "예상" 금액 (2026-11-18) — 서버·테스트 공용 순수 규칙.
 *
 * 멘토링이 아직 끝나지 않은 멘티의 **등록된 일정(보고서 전 회차)** 도 수당표에 미리 넣어
 * 발주처에 예상 수당을 보낼 수 있게 한다. 금액은 그 회차의 금액 스냅샷(시간당 단가 × 운영시간,
 * 그룹멘토링 비대표 회차는 0원)이고, 엑셀에는 "200,000(예상)" 처럼 보인다(값은 숫자 그대로라 합계가 된다).
 *
 * 예상으로 넣는 회차 = [정산·품의] '아직 검수·정산에 들어오지 않은 멘티'와 같은 기준의 케이스에서
 *  - 보고서가 아직 없고
 *  - 그 케이스의 지금 담당 멘토가 등록한 회차
 *  - 케이스가 진행 단계(멘토 배정·진행 중·재배정 대기·보완 요청)이고, 포기·종료 표시가 없고, 멘티가 비활성이 아님
 */
export const EXPECTED_OPEN_STATUSES: readonly string[] = ['mentor_assigned', 'in_progress', 'reassignment_pending', 'revision_requested'];

/** 엑셀 숫자 서식 — 값은 숫자, 화면에는 "200,000(예상)" */
export const EXPECTED_FMT = '#,##0"(예상)"';
export const EXPECTED_TOTAL_FMT = '#,##0"(예상 포함)"';

export interface ExpectedCaseInfo {
  status: string;
  outcome: string | null;
  menteeInactive: boolean;
  /** 지금 활성 배정 멘토(없으면 null) */
  activeMentorId: string | null;
}

export function isExpectedRound(l: { mentor_id: string; report_registered_at: string | null }, c: ExpectedCaseInfo | undefined): boolean {
  if (!c || l.report_registered_at) return false;
  if (!EXPECTED_OPEN_STATUSES.includes(c.status) || c.outcome || c.menteeInactive) return false;
  return !!c.activeMentorId && l.mentor_id === c.activeMentorId;
}
