import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime } from './format';
import { calendarYmd, fromKstCalendar, kstHm, kstMd, kstStartOfDay, kstTodayYmd, kstWeekdayLabel, kstWhen, kstYmd, toKstCalendar, toKstParts } from './kst';

/** 실행 환경 TZ 와 무관해야 한다 — vitest 는 샌드박스(UTC) 에서, 개발자는 KST 에서 돌려도 같은 결과 */
describe('KST 고정 시각 유틸 (P35-D)', () => {
  it('UTC 14:30 → KST 같은 날 23:30', () => {
    expect(formatDateTime('2026-09-28T14:30:00Z')).toBe('2026.09.28 23:30');
    expect(formatDate('2026-09-28T14:30:00Z')).toBe('2026.09.28');
    expect(kstHm('2026-09-28T14:30:00Z')).toBe('23:30');
  });
  it('UTC 15:30 → KST 다음 날 00:30 (날짜 경계)', () => {
    expect(formatDateTime('2026-09-28T15:30:00Z')).toBe('2026.09.29 00:30');
    expect(formatDate('2026-09-28T15:30:00Z')).toBe('2026.09.29');
    expect(kstYmd('2026-09-28T15:30:00Z')).toBe('2026-09-29');
  });
  it('+09:00 오프셋 문자열(회차 저장 형식)도 같은 순간으로 해석한다', () => {
    expect(formatDateTime('2026-09-28T23:30:00+09:00')).toBe('2026.09.28 23:30');
    expect(formatDateTime(new Date('2026-09-28T14:30:00Z'))).toBe('2026.09.28 23:30');
  });
  it("'YYYY-MM-DD' 만 있는 값(date 컬럼)은 +9h 로 밀리지 않고 그대로", () => {
    expect(formatDate('2026-09-28')).toBe('2026.09.28');
    expect(formatDateTime('2026-09-28')).toBe('2026.09.28');
    expect(toKstParts('2026-12-31')).toMatchObject({ y: 2026, m: 12, d: 31, hh: 0, mm: 0, weekday: 4 });
  });
  it('요일: 2026-09-28 은 월요일, UTC 15:30 은 KST 화요일', () => {
    expect(kstWeekdayLabel('2026-09-28')).toBe('월');
    expect(kstWeekdayLabel('2026-09-28T14:30:00Z')).toBe('월');
    expect(kstWeekdayLabel('2026-09-28T15:30:00Z')).toBe('화');
    expect(kstWhen('2026-09-28T15:30:00Z')).toBe('9/29(화) 00:30');
    expect(kstMd('2026-09-28T15:30:00Z')).toBe('9/29');
  });
  it('잘못된 값·빈 값은 "-" / 빈 문자열', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('')).toBe('-');
    expect(formatDate('not-a-date')).toBe('-');
    expect(formatDateTime(undefined)).toBe('-');
    expect(kstYmd('bad')).toBe('');
    expect(kstHm(null)).toBe('');
  });
  it('오늘(KST) 판정은 UTC 자정 전후로 달라진다', () => {
    expect(kstTodayYmd(Date.parse('2026-09-28T14:59:00Z'))).toBe('2026-09-28');
    expect(kstTodayYmd(Date.parse('2026-09-28T15:00:00Z'))).toBe('2026-09-29');
  });
  it('달력 산술: KST 날짜를 UTC 필드에 담아 계산하고 되돌린다', () => {
    const cal = toKstCalendar('2026-09-28T15:30:00Z');
    expect(calendarYmd(cal)).toBe('2026-09-29');
    expect(cal.getUTCDay()).toBe(2);
    expect(fromKstCalendar(cal).toISOString()).toBe('2026-09-28T15:30:00.000Z');
    expect(kstStartOfDay('2026-09-29')?.toISOString()).toBe('2026-09-28T15:00:00.000Z');
    expect(kstStartOfDay('2026/09/29')).toBeNull();
  });
});
