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

/**
 * 멘토링 시간은 **1시간 단위로만** 등록한다 (2026-10-06, 사용자 결정) — 분 단위 시간은 수당 지급이 어렵다.
 * 등록·계획 일정 수정·운영사 정정의 서버 게이트와 화면 안내가 이 함수·문구를 같이 쓴다.
 * (이미 등록된 회차의 보고서 등록은 막지 않는다 — 기존 일정은 [일정 수정]으로 시간 단위로 맞춘다)
 */
export function isWholeHours(startedAt: string | Date, endedAt: string | Date): boolean {
  const m = roundMinutes(startedAt, endedAt);
  return m > 0 && m % 60 === 0;
}

export const HOURLY_ONLY_ERROR = '멘토링 시간은 1시간 단위로만 등록할 수 있습니다. (예: 14:00~16:00 = 2시간) 분 단위 시간은 수당 지급이 어렵습니다.';
export const HOURLY_ONLY_NOTICE = '멘토링 시간은 반드시 1시간 단위(1시간·2시간·3시간)로 등록하세요. 분 단위(예: 1시간 30분)는 수당 지급이 어렵습니다.';
