import { describe, expect, it } from 'vitest';

import { hmPlus, roundSpan, roundSpanError, roundTimeRangeLabel } from './round-time';

describe('회차 시간 — 자정 넘기기', () => {
  it('21:00~00:00 = 자정까지 3시간', () => {
    const s = roundSpan('2026-11-10', '21:00', '00:00')!;
    expect(s.minutes).toBe(180);
    expect(s.overnight).toBe(true);
    expect(roundSpanError(new Date(s.startIso), new Date(s.endIso))).toBeNull();
    expect(roundTimeRangeLabel(s.startIso, s.endIso)).toBe('21:00~24:00');
  });
  it('23:00~02:00 = 다음 날 새벽 2시까지 3시간', () => {
    const s = roundSpan('2026-11-10', '23:00', '02:00')!;
    expect(s.minutes).toBe(180);
    expect(s.endIso).toBe(new Date('2026-11-11T02:00:00+09:00').toISOString());
    expect(roundSpanError(new Date(s.startIso), new Date(s.endIso))).toBeNull();
    expect(roundTimeRangeLabel(s.startIso, s.endIso)).toBe('23:00~02:00(다음 날)');
  });
  it('같은 날은 그대로, 시작 = 종료는 0분', () => {
    expect(roundSpan('2026-11-10', '14:00', '17:00')!.minutes).toBe(180);
    expect(roundSpan('2026-11-10', '14:00', '14:00')!.minutes).toBe(0);
    expect(roundTimeRangeLabel(new Date('2026-11-10T14:00:00+09:00').toISOString(), new Date('2026-11-10T17:00:00+09:00').toISOString())).toBe('14:00~17:00');
  });
  it('자정을 넘는 회차는 12시간까지, 이틀 넘김은 거부', () => {
    const long = roundSpan('2026-11-10', '14:00', '13:00')!; // 23시간
    expect(roundSpanError(new Date(long.startIso), new Date(long.endIso))).toContain('12시간');
    expect(roundSpanError(new Date('2026-11-10T22:00:00+09:00'), new Date('2026-11-12T01:00:00+09:00'))).not.toBeNull();
    expect(roundSpanError(new Date('2026-11-10T22:00:00+09:00'), new Date('2026-11-10T21:00:00+09:00'))).not.toBeNull();
  });
  it('종료 기본값은 자정을 넘어 돈다', () => {
    expect(hmPlus('23:00', 60)).toBe('00:00');
    expect(hmPlus('14:00', 60)).toBe('15:00');
  });
});
