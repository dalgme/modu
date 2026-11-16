import { describe, expect, it } from 'vitest';

import { decideConverterRun, isHwpFile, parseConverterSchedule, validateConverterTimes } from './schedule-rule';

const kst = (s: string) => Date.parse(`${s}+09:00`);
const sched = { enabled: true, times: ['09:00', '12:00', '17:00'] };

describe('decideConverterRun', () => {
  it('오늘 9시가 지났고 그 뒤로 실행이 없으면 지금 실행', () => {
    const d = decideConverterRun(sched, '2026-11-16T08:00:00+09:00', null, kst('2026-11-16T09:00:30'));
    expect(d.runNow).toBe(true);
    expect(d.nextRunAt).toBe(new Date(kst('2026-11-16T12:00:00')).toISOString());
  });
  it('9시 실행 뒤 10시에는 실행 안 함 — 12시까지 자되 최대 1시간', () => {
    const d = decideConverterRun(sched, '2026-11-16T09:01:00+09:00', null, kst('2026-11-16T10:00:00'));
    expect(d.runNow).toBe(false);
    expect(d.sleepSeconds).toBe(3600);
  });
  it('PC 가 꺼져 있다 14시에 켜지면 놓친 12시분을 1회 바로 실행', () => {
    expect(decideConverterRun(sched, '2026-11-16T09:01:00+09:00', null, kst('2026-11-16T14:00:00')).runNow).toBe(true);
  });
  it('어제 실행 기록만 있고 오늘 첫 시각 전이면 실행 안 함(전날 것을 몰아서 하지 않음)', () => {
    const d = decideConverterRun(sched, '2026-11-15T17:00:10+09:00', null, kst('2026-11-16T08:00:00'));
    expect(d.runNow).toBe(false);
    expect(d.sleepSeconds).toBe(3600);
  });
  it('17시 이후 다음 시각은 내일 9시', () => {
    const d = decideConverterRun(sched, '2026-11-16T17:00:30+09:00', null, kst('2026-11-16T23:30:00'));
    expect(d.nextRunAt).toBe(new Date(kst('2026-11-17T09:00:00')).toISOString());
  });
  it('[지금 변환 요청]은 마지막 실행 뒤면 바로 실행, 꺼진 일정에서도', () => {
    expect(decideConverterRun({ enabled: false, times: ['09:00'] }, '2026-11-16T09:01:00+09:00', '2026-11-16T10:00:00+09:00', kst('2026-11-16T10:05:00')).runNow).toBe(true);
    expect(decideConverterRun({ enabled: false, times: ['09:00'] }, null, null, kst('2026-11-16T10:05:00')).runNow).toBe(false);
  });
  it('남은 시간이 짧으면 그만큼만 잔다(최소 60초)', () => {
    expect(decideConverterRun(sched, '2026-11-16T09:01:00+09:00', null, kst('2026-11-16T11:50:00')).sleepSeconds).toBe(600);
  });
});

describe('일정 값 정리', () => {
  it('저장값 정리·기본값', () => {
    expect(parseConverterSchedule(null)).toEqual({ enabled: true, times: ['09:00', '12:00', '17:00'] });
    expect(parseConverterSchedule({ enabled: false, times: ['17:00', '9:00', 'x', '9:00'] })).toEqual({ enabled: false, times: ['09:00', '17:00'] });
  });
  it('입력 검사', () => {
    expect(validateConverterTimes(['12:00', '9:00'])).toEqual({ ok: true, times: ['09:00', '12:00'] });
    expect(validateConverterTimes(['25:00']).ok).toBe(false);
    expect(validateConverterTimes(['']).ok).toBe(false);
  });
  it('한글 파일 판정', () => {
    expect(isHwpFile('a.HWP')).toBe('hwp');
    expect(isHwpFile('a.hwpx')).toBe('hwpx');
    expect(isHwpFile('a.bin', 'application/haansofthwp')).toBe('hwp');
    expect(isHwpFile('a.pdf', 'application/pdf')).toBeNull();
  });
});
