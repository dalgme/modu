/**
 * 케이스 진행 초기화 (2026-09-30) — 서버·클라이언트 중립 규칙.
 * 테스트로 진행했던 회차·보고서·관찰의견서·종결/검수 기록을 지우고 케이스를 '멘토 배정' 상태로 되돌리면
 * 감사 로그 `case.progress_reset` 1건이 남는다. 감사 로그는 추가만 되는 기록이라 지우지 않고,
 * 케이스 [조치 이력] 화면에서만 **초기화 이전의 진행 기록**을 숨긴다(행사 감사 로그·플랫폼 감사 로그에는 그대로 남음).
 * 등록·배정·사업계획서처럼 진행과 무관한 기록은 그대로 보인다.
 */
export const PROGRESS_RESET_ACTION = 'case.progress_reset';

/** 초기화로 무효가 되는 "진행" 기록 — 회차·보고서·관찰의견서·서명·만족도·종결 요청·검수·정산·중도 종료/재배정 요청 */
const PROGRESS_PREFIXES = ['round.', 'observation.', 'signature.', 'survey.', 'settlement.', 'case.closure', 'case.review', 'case.withdraw', 'withdrawal.', 'extension.'];

export function isProgressAction(action: string): boolean {
  return PROGRESS_PREFIXES.some((p) => action.startsWith(p));
}

/** 가장 최근 초기화 시각 이전의 진행 기록을 뺀다. 초기화 기록이 없으면 그대로 */
export function hideSupersededProgress<T extends { action: string; created_at: string }>(rows: T[]): T[] {
  const resetAt = rows.filter((r) => r.action === PROGRESS_RESET_ACTION).reduce<string | null>((max, r) => (max === null || r.created_at > max ? r.created_at : max), null);
  if (!resetAt) return rows;
  return rows.filter((r) => !(isProgressAction(r.action) && r.created_at < resetAt));
}
