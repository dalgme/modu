import { describe, expect, it } from 'vitest';

import { menteeRoundAddBlock, menteeRoundRemovalBlock } from './mentee-round-rule';

const empty = { status: 'registered', logs: 0, settlements: 0, documents: 0, surveyResponses: 0, successors: 0 };

describe('멘티 라운드 빼기', () => {
  it('진행 기록이 없는 케이스는 뺄 수 있다 (멘토 배정만 된 경우 포함)', () => {
    expect(menteeRoundRemovalBlock(empty)).toBeNull();
    expect(menteeRoundRemovalBlock({ ...empty, status: 'mentor_assigned' })).toBeNull();
  });
  it('회차·정산·서류·응답·승계가 있으면 막는다', () => {
    expect(menteeRoundRemovalBlock({ ...empty, logs: 1 })).toContain('회차');
    expect(menteeRoundRemovalBlock({ ...empty, settlements: 1 })).toContain('정산');
    expect(menteeRoundRemovalBlock({ ...empty, documents: 2 })).toContain('서류');
    expect(menteeRoundRemovalBlock({ ...empty, surveyResponses: 1 })).toContain('만족도');
    expect(menteeRoundRemovalBlock({ ...empty, successors: 1 })).toContain('다음 라운드');
  });
  it('검수·정산 단계는 막는다', () => {
    expect(menteeRoundRemovalBlock({ ...empty, status: 'closure_requested' })).not.toBeNull();
    expect(menteeRoundRemovalBlock({ ...empty, status: 'closed' })).not.toBeNull();
  });
});

describe('멘티 라운드 추가', () => {
  it('진행 중 케이스가 있거나 종료 라운드면 막는다', () => {
    expect(menteeRoundAddBlock({ status: 'active', hasOpenCase: false })).toBeNull();
    expect(menteeRoundAddBlock({ status: 'active', hasOpenCase: true })).toContain('이미');
    expect(menteeRoundAddBlock({ status: 'ended', hasOpenCase: false })).toContain('종료');
  });
});
