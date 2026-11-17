import { describe, expect, it } from 'vitest';

import { inboxGroupOf, normalizeMentorRequestKind } from './mentor-request-kind';

describe('멘토 요청 분류', () => {
  it('kind 정규화 — 값이 없으면 멘토 변경', () => {
    expect(normalizeMentorRequestKind('early_closure')).toBe('early_closure');
    expect(normalizeMentorRequestKind(undefined)).toBe('reassign');
    expect(normalizeMentorRequestKind('x')).toBe('reassign');
  });
  it('요청함 탭', () => {
    expect(inboxGroupOf({ kind: 'extension' })).toBe('extension');
    expect(inboxGroupOf({ kind: 'mentor_change' })).toBe('change');
    expect(inboxGroupOf({ kind: 'mentor_withdrawal', withdrawalKind: 'reassign' })).toBe('change');
    expect(inboxGroupOf({ kind: 'mentor_withdrawal', withdrawalKind: 'early_closure' })).toBe('closure');
  });
});
