import { describe, expect, it } from 'vitest';

import { canMentorDeleteRound, firstEmptyRoundNo } from './round-slots';

describe('firstEmptyRoundNo', () => {
  it('비어 있지 않으면 다음 번호', () => {
    expect(firstEmptyRoundNo([])).toBe(1);
    expect(firstEmptyRoundNo([1, 2, 3])).toBe(4);
  });
  it('중간 회차를 지우면 그 자리를 먼저 채운다', () => {
    expect(firstEmptyRoundNo([1, 3, 4])).toBe(2);
    expect(firstEmptyRoundNo([2, 3, 4])).toBe(1);
  });
});

describe('canMentorDeleteRound', () => {
  const base = { editable: true, own: true, locked: false, menteeSigned: false };
  it('본인·정산 전·서명 전이면 어느 회차든 삭제 가능', () => expect(canMentorDeleteRound(base)).toBe(true));
  it('정산 포함·멘티 서명·다른 멘토·잠긴 단계는 불가', () => {
    expect(canMentorDeleteRound({ ...base, locked: true })).toBe(false);
    expect(canMentorDeleteRound({ ...base, menteeSigned: true })).toBe(false);
    expect(canMentorDeleteRound({ ...base, own: false })).toBe(false);
    expect(canMentorDeleteRound({ ...base, editable: false })).toBe(false);
  });
});
