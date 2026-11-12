import { describe, expect, it } from 'vitest';

import { isMentoringOver, needsMentorAssignment } from './mentoring-outcome';

describe('멘토 배정 대기 규칙', () => {
  it('등록·재배정 대기 상태이면서 포기·종료 표시가 없으면 배정 대기', () => {
    expect(needsMentorAssignment({ status: 'registered', mentoring_outcome: null })).toBe(true);
    expect(needsMentorAssignment({ status: 'reassignment_pending' })).toBe(true);
  });
  it('중도 포기·중도 종료(또는 멘토링 포기·종료)로 표시된 케이스는 제외', () => {
    expect(needsMentorAssignment({ status: 'reassignment_pending', mentoring_outcome: 'gave_up' })).toBe(false);
    expect(needsMentorAssignment({ status: 'registered', mentoring_outcome: 'ended' })).toBe(false);
  });
  it('배정 이후 단계는 배정 대기가 아니다', () => {
    expect(needsMentorAssignment({ status: 'in_progress', mentoring_outcome: null })).toBe(false);
    expect(needsMentorAssignment({ status: 'withdrawn', mentoring_outcome: null })).toBe(false);
  });
  it('알 수 없는 값은 표시 없음으로 본다', () => {
    expect(isMentoringOver('x')).toBe(false);
    expect(isMentoringOver(null)).toBe(false);
    expect(isMentoringOver('gave_up')).toBe(true);
  });
});
