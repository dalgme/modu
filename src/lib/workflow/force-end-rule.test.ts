import { describe, expect, it } from 'vitest';

import { FORCE_END_REQUIRED_STATUSES, forceEndHref, forceEndMessage, requiresForceEnd } from './force-end-rule';

describe('requiresForceEnd', () => {
  it('진행 중 상태 + 보고서 등록 1회 이상이면 강제 종료가 필요하다', () => {
    for (const s of FORCE_END_REQUIRED_STATUSES) expect(requiresForceEnd(s, 1)).toBe(true);
  });
  it('보고서 등록 회차가 없으면(계획만 있어도) 비활성화할 수 있다', () => {
    expect(requiresForceEnd('in_progress', 0)).toBe(false);
    expect(requiresForceEnd('mentor_assigned', 0)).toBe(false);
  });
  it('중도 종료·종결·정산 확정 이후 케이스는 막지 않는다', () => {
    expect(requiresForceEnd('withdrawn', 3)).toBe(false);
    expect(requiresForceEnd('closed', 4)).toBe(false);
    expect(requiresForceEnd('settlement_pending', 4)).toBe(false);
    expect(requiresForceEnd('settlement_batched', 4)).toBe(false);
    expect(requiresForceEnd('registered', 0)).toBe(false);
  });
  it('안내 문구와 경로', () => {
    expect(forceEndHref('abc')).toBe('/nextlab/cases/abc#case-end-panel');
    const msg = forceEndMessage('홍길동', { reportedRounds: 2, groupName: 'A그룹' });
    expect(msg).toContain('홍길동 멘티는 A그룹 멘토링이 2회');
    expect(msg).toContain('중도 종료');
  });
});
