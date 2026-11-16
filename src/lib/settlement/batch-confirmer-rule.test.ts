import { describe, expect, it } from 'vitest';

import { batchConfirmerFor, canConfirmAs } from './batch-confirmer-rule';

describe('품의 정산 확인 주체', () => {
  it('기본(모든 라운드 꺼짐·값 없음) = 운영사', () => {
    expect(batchConfirmerFor([])).toBe('operator');
    expect(batchConfirmerFor([false, null, undefined])).toBe('operator');
  });
  it('켜진 라운드가 하나라도 있으면 발주처', () => {
    expect(batchConfirmerFor([false, true])).toBe('institution');
  });
  it('버튼·서버 게이트는 확인 주체 역할에게만', () => {
    expect(canConfirmAs('nextlab', 'operator')).toBe(true);
    expect(canConfirmAs('nextlab', 'institution')).toBe(false);
    expect(canConfirmAs('institution', 'institution')).toBe(true);
    expect(canConfirmAs('institution', 'operator')).toBe(false);
  });
});
