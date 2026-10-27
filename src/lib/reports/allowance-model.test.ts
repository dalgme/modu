import { describe, expect, it } from 'vitest';

import { computeSettlement } from '@/lib/settlement/compute';
import { mentorTax, mostCommon, slotFee, taxFormula, type TaxRule } from './allowance-model';

const other: TaxRule = { method: 'other_income', expenseRate: 0.6, taxRate: 0.2, localRate: 0.1, rounding: 'floor_10', minTaxable: 50000 };
const rates = { online: 80000, offline: 100000 };

describe('slotFee', () => {
  it('이행 회차만 시간 × 단가', () => {
    expect(slotFee({ mode: '온라인', hours: 2 }, rates)).toBe(160000);
    expect(slotFee({ mode: '오프라인', hours: 1 }, rates)).toBe(100000);
    expect(slotFee({ mode: '예정', hours: 2 }, rates)).toBe(0);
    expect(slotFee({ mode: '미시행', hours: null }, rates)).toBe(0);
    expect(slotFee({ mode: '타멘토', hours: null }, rates)).toBe(0);
  });
});

describe('mentorTax — 창경 1기 1R 산출 내역과 같은 값', () => {
  it('80,000원은 과세최저한으로 0원, 200,000원은 17,600원, 1,160,000원은 102,080원', () => {
    expect(mentorTax(80000, other)).toBe(0);
    expect(mentorTax(200000, other)).toBe(17600);
    expect(mentorTax(1160000, other)).toBe(102080);
  });
  it('플랫폼 정산 계산(computeSettlement)과 같은 결과', () => {
    for (const gross of [100000, 125000, 125010, 480000, 600000, 1440000]) {
      const r = computeSettlement({ rounds: [{ log_id: 'l', round_no: 1, mode: 'offline', started_at: '2026-10-01T00:00:00Z', unit_price_snapshot: gross, amount_snapshot: gross, is_extra: false, mentor_id: 'm' }], withholding: { method: 'other_income', expense_rate: 0.6, tax_rate: 0.2, local_rate: 0.1, rounding: 'floor_10', min_taxable_exempt: 50000 } });
      expect(mentorTax(gross, other)).toBe(r.withholding);
    }
  });
  it('사업소득 3.3%·없음', () => {
    expect(mentorTax(1000000, { method: 'business_income', taxRate: 0.03, localRate: 0.1, rounding: 'floor_10' })).toBe(33000);
    expect(mentorTax(1000000, { method: 'none' })).toBe(0);
  });
});

describe('taxFormula', () => {
  const cells = { expenseRate: 'E', otherTaxRate: 'T', otherLocalRate: 'L', minTaxable: 'M', bizTaxRate: 'BT', bizLocalRate: 'BL' };
  it('기타소득 = 과세최저한 판정 + 소득세 + 지방세(10원 미만 버림)', () => {
    expect(taxFormula('S6', other, cells)).toBe('IF(ROUNDDOWN(S6*(1-E),0)<=M,0,ROUNDDOWN(ROUNDDOWN(S6*(1-E),0)*T,-1)+ROUNDDOWN(ROUNDDOWN(ROUNDDOWN(S6*(1-E),0)*T,-1)*L,-1))');
    expect(taxFormula('S6', { method: 'none' }, cells)).toBe('0');
  });
});

describe('mostCommon', () => {
  it('가장 많이 쓰인 단가, 없으면 기본값', () => {
    expect(mostCommon([80000, 80000, 70000], 1)).toBe(80000);
    expect(mostCommon([], 5)).toBe(5);
  });
});
