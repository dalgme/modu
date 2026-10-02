import { describe, expect, it } from 'vitest';
import { amountForMinutes, roundAmount, roundMinutes } from './round-amount';

describe('회차 금액 = 시간당 단가 × 운영시간 (P50)', () => {
  it('3시간 오프라인 = 300,000원', () => {
    expect(roundAmount(100000, '2026-10-02T10:00:00+09:00', '2026-10-02T13:00:00+09:00')).toBe(300000);
  });
  it('1시간 30분 온라인 = 120,000원', () => {
    expect(roundAmount(80000, '2026-10-02T10:00:00+09:00', '2026-10-02T11:30:00+09:00')).toBe(120000);
  });
  it('10분 단위는 비례 후 원 단위 반올림', () => {
    expect(amountForMinutes(80000, 10)).toBe(13333);
    expect(amountForMinutes(100000, 50)).toBe(83333);
  });
  it('시간이 없거나 거꾸로면 0', () => {
    expect(roundMinutes('2026-10-02T13:00:00+09:00', '2026-10-02T10:00:00+09:00')).toBe(0);
    expect(amountForMinutes(100000, 0)).toBe(0);
  });
});
