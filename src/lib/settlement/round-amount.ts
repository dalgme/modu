/**
 * 회차 금액 (2026-10-02, P50) — 단가는 **시간당** 금액이다. 회차 금액 = 시간당 단가 × 운영시간.
 *  예) 오프라인 시간당 100,000원 × 3시간 = 300,000원 (같은 멘티·같은 날 오프라인 상한 300,000원 = 3시간 분량).
 *  시간은 10분 단위로 입력되므로 분 단위로 비례 계산하고 원 단위로 반올림한다.
 * 등록·일정 수정·보고서 등록(재확정)·운영사 정정이 전부 이 함수 하나로 금액 스냅샷을 만든다 — 중립 파일(서버·클라이언트 공용).
 */
export function roundMinutes(startedAt: string | Date, endedAt: string | Date): number {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60000) : 0;
}

export function roundAmount(hourlyPrice: number, startedAt: string | Date, endedAt: string | Date): number {
  return amountForMinutes(hourlyPrice, roundMinutes(startedAt, endedAt));
}

export function amountForMinutes(hourlyPrice: number, minutes: number): number {
  if (!Number.isFinite(hourlyPrice) || hourlyPrice <= 0 || minutes <= 0) return 0;
  return Math.round((hourlyPrice * minutes) / 60);
}
