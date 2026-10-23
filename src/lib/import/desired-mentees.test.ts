import { describe, expect, it } from 'vitest';

import { matchDesiredRows, parseDesired } from './desired-mentees';

const mentors = [
  { id: 'a', name: '김진태', phone: '010-1111-2222', email: 'kim1@x.com' },
  { id: 'b', name: '김진태', phone: '01033334444', email: 'kim2@x.com' },
  { id: 'c', name: '이 멘토', phone: null, email: null },
];
const row = (line: number, name: string, desired: string, phone = '', email = '') => ({ line, name, phone, email, desired });

describe('parseDesired', () => {
  it('정수·"명"·빈 값', () => {
    expect(parseDesired('3')).toEqual({ ok: true, value: 3 });
    expect(parseDesired('2명')).toEqual({ ok: true, value: 2 });
    expect(parseDesired('')).toEqual({ ok: true, value: null });
    expect(parseDesired('-')).toEqual({ ok: true, value: null });
    expect(parseDesired('1.5').ok).toBe(false);
    expect(parseDesired('100').ok).toBe(false);
  });
});

describe('matchDesiredRows', () => {
  it('이름이 하나면 이름으로 (공백 무시)', () => {
    const r = matchDesiredRows([row(2, '이멘토', '4')], mentors);
    expect(r.values.get('c')).toBe(4);
  });
  it('동명이인은 전화번호로 구분 (형식 무관)', () => {
    const r = matchDesiredRows([row(2, '김진태', '3', '010 3333 4444'), row(3, '김진태', '1', '01011112222')], mentors);
    expect(r.values.get('b')).toBe(3);
    expect(r.values.get('a')).toBe(1);
    expect(r.ambiguous).toHaveLength(0);
  });
  it('전화번호가 안 맞으면 이메일로, 그래도 안 되면 구분 불가', () => {
    const r = matchDesiredRows([row(2, '김진태', '2', '01099998888', 'KIM2@x.com'), row(3, '김진태', '2', '')], mentors);
    expect(r.values.get('b')).toBe(2);
    expect(r.ambiguous).toHaveLength(1);
  });
  it('없는 이름·잘못된 값·중복 행', () => {
    const r = matchDesiredRows([row(2, '박없음', '1'), row(3, '이멘토', '셋'), row(4, '이멘토', '1'), row(5, '이멘토', '2')], mentors);
    expect(r.notFound).toHaveLength(1);
    expect(r.invalid).toHaveLength(1);
    expect(r.duplicate).toHaveLength(1);
    expect(r.values.get('c')).toBe(2);
  });
});
