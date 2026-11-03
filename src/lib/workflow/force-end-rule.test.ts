import { describe, expect, it } from 'vitest';

import { blocksDeactivation, forceEndHref, forceEndMessage, isProgressedRound } from './force-end-rule';

describe('blocksDeactivation', () => {
  it('진행 회차 1회 이상이면 비활성화하지 않는다 (케이스 상태 무관)', () => {
    expect(blocksDeactivation(1)).toBe(true);
    expect(blocksDeactivation(4)).toBe(true);
    expect(blocksDeactivation(0)).toBe(false);
  });
});

describe('isProgressedRound', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  it('보고서 등록 또는 종료 시각 경과 = 진행 회차', () => {
    expect(isProgressedRound({ report_registered_at: '2026-10-01T00:00:00Z', ended_at: '2026-12-01T00:00:00Z' }, now)).toBe(true);
    expect(isProgressedRound({ report_registered_at: null, ended_at: '2026-11-03T11:00:00Z' }, now)).toBe(true);
    expect(isProgressedRound({ report_registered_at: null, ended_at: '2026-11-10T11:00:00Z' }, now)).toBe(false);
  });
});

describe('문구·경로', () => {
  it('중도 포기·중도 종료 표시를 안내한다', () => {
    expect(forceEndHref('abc')).toBe('/nextlab/cases/abc#case-end-panel');
    const msg = forceEndMessage('홍길동', { reportedRounds: 2, groupName: 'A그룹' });
    expect(msg).toContain('홍길동 멘티는 A그룹 멘토링을 2회');
    expect(msg).toContain('중도 포기');
  });
});
