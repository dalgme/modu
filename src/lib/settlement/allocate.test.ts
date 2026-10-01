import { describe, expect, it } from 'vitest';

import { allocateWithholding } from './compute';

describe('allocateWithholding', () => {
  it('합계가 원천징수 합계와 정확히 같다', () => {
    const parts = allocateWithholding([80000, 80000, 100000, 100000], 31680);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(31680);
    expect(parts[2]).toBeGreaterThan(parts[0]!);
  });
  it('나누어떨어지지 않아도 합계 보존', () => {
    const parts = allocateWithholding([80000, 80000, 80000], 21120);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(21120);
    expect(parts).toEqual([7040, 7040, 7040]);
    const odd = allocateWithholding([1, 1, 1], 10);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(10);
  });
  it('세금 0 · 빈 입력', () => {
    expect(allocateWithholding([80000, 80000], 0)).toEqual([0, 0]);
    expect(allocateWithholding([], 100)).toEqual([]);
  });
});
