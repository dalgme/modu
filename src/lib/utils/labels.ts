/**
 * 화면 표기 규칙 (P25-01·10) — 서버·클라이언트 공용, DB 접근 없음.
 */

/** 멘티 표기: 닉네임(소속)이 없거나 이름과 같으면 이름만, 아니면 "이름/닉네임" */
export function menteeLabel(name: string, businessName: string | null | undefined): string {
  const n = (name ?? '').trim();
  const b = (businessName ?? '').trim();
  if (!b || b === n) return n;
  return `${n}/${b}`;
}

/** 멘티 소속(닉네임)만 — 이름과 같으면 빈 문자열 */
export function menteeOrg(name: string, businessName: string | null | undefined): string {
  const n = (name ?? '').trim();
  const b = (businessName ?? '').trim();
  return !b || b === n ? '' : b;
}

/** 멘토 표기: "이름(현재 확정 배정 멘티 수)" */
export function mentorLabel(name: string, assignedCount: number | null | undefined): string {
  return `${name}(${assignedCount ?? 0})`;
}

/** 원문자 회차 번호 ①…⑳ (그 이상은 숫자) */
export function circledNumber(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
  return String(n);
}
