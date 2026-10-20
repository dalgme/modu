import { describe, expect, it } from 'vitest';

import { isMatchingPublished } from './visibility-shared';

describe('isMatchingPublished', () => {
  it('false 만 감추기', () => {
    expect(isMatchingPublished({ matching_published: false })).toBe(false);
    expect(isMatchingPublished({ matching_published: true })).toBe(true);
  });
  it('컬럼이 없거나 그룹을 모르면 공개 (마이그레이션 전 기존 동작 보호)', () => {
    expect(isMatchingPublished({})).toBe(true);
    expect(isMatchingPublished(null)).toBe(true);
    expect(isMatchingPublished(undefined)).toBe(true);
    expect(isMatchingPublished({ matching_published: null })).toBe(true);
  });
});
