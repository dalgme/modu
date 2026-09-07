import { describe, expect, it } from 'vitest';

import {
  applyRounding,
  computeSettlement,
  effectiveRate,
  policyFromParams,
  splitByMentor,
  sumSettlements,
  type SettlementRoundInput,
  type WithholdingPolicy,
} from './compute';

const OTHER: WithholdingPolicy = { method: 'other_income', expense_rate: 0.6, tax_rate: 0.2, local_rate: 0.1, rounding: 'floor_10', min_taxable_exempt: 50000 };
const BUSINESS: WithholdingPolicy = { method: 'business_income', tax_rate: 0.03, local_rate: 0.1, rounding: 'floor_10' };

let seq = 0;
function round(mode: 'online' | 'offline', price: number, opts: Partial<SettlementRoundInput> = {}): SettlementRoundInput {
  seq += 1;
  return {
    log_id: `log-${seq}`,
    round_no: seq,
    mode,
    started_at: `2026-10-0${(seq % 9) + 1}T01:00:00.000Z`,
    unit_price_snapshot: price,
    amount_snapshot: price,
    is_extra: false,
    mentor_id: 'm1',
    ...opts,
  };
}

describe('computeSettlement — 기타소득 (설계 §6-2 예시)', () => {
  it('오프라인 4회 400,000 → 기타소득금액 160,000 · 소득세 32,000 · 지방세 3,200 · 실지급 364,800', () => {
    const r = computeSettlement({ rounds: [round('offline', 100000), round('offline', 100000), round('offline', 100000), round('offline', 100000)], withholding: OTHER });
    expect(r.gross).toBe(400000);
    expect(r.taxable).toBe(160000);
    expect(r.income_tax).toBe(32000);
    expect(r.local_tax).toBe(3200);
    expect(r.withholding).toBe(35200);
    expect(r.net).toBe(364800);
    expect(r.exempted).toBe(false);
    expect(r.lines).toEqual([{ mode: 'offline', is_extra: false, count: 4, unit_price: 100000, amount: 400000 }]);
  });

  it('유형 혼합: 온라인 2회 + 오프라인 2회 → 내역 2줄, 합계 360,000', () => {
    const r = computeSettlement({ rounds: [round('offline', 100000), round('online', 80000), round('offline', 100000), round('online', 80000)], withholding: OTHER });
    expect(r.lines).toEqual([
      { mode: 'online', is_extra: false, count: 2, unit_price: 80000, amount: 160000 },
      { mode: 'offline', is_extra: false, count: 2, unit_price: 100000, amount: 200000 },
    ]);
    expect(r.gross).toBe(360000);
    expect(r.taxable).toBe(144000);
    expect(r.income_tax).toBe(28800);
    expect(r.local_tax).toBe(2880);
    expect(r.net).toBe(360000 - 31680);
  });

  it('추가 회차는 별도 줄로 분리되고 합계에는 포함된다', () => {
    const r = computeSettlement({ rounds: [round('online', 80000), round('online', 80000), round('online', 80000, { is_extra: true })], withholding: OTHER });
    expect(r.lines).toEqual([
      { mode: 'online', is_extra: false, count: 2, unit_price: 80000, amount: 160000 },
      { mode: 'online', is_extra: true, count: 1, unit_price: 80000, amount: 80000 },
    ]);
    expect(r.gross).toBe(240000);
  });

  it('단가가 중간에 바뀌면 스냅샷 단가별로 줄이 갈린다 (소급 없음)', () => {
    const r = computeSettlement({ rounds: [round('online', 80000), round('online', 90000)], withholding: OTHER });
    expect(r.lines.map((l) => l.unit_price)).toEqual([80000, 90000]);
    expect(r.gross).toBe(170000);
  });

  it('과세최저한 경계: 기타소득금액 50,000 이하는 원천징수 0 (1회 온라인 80,000 → 32,000)', () => {
    const r = computeSettlement({ rounds: [round('online', 80000)], withholding: OTHER });
    expect(r.taxable).toBe(32000);
    expect(r.withholding).toBe(0);
    expect(r.net).toBe(80000);
    expect(r.exempted).toBe(true);
  });

  it('과세최저한 경계: 정확히 50,000 은 면제, 50,001 부터 과세', () => {
    const exact = computeSettlement({ rounds: [round('online', 125000)], withholding: OTHER }); // 125,000 × 0.4 = 50,000
    expect(exact.taxable).toBe(50000);
    expect(exact.withholding).toBe(0);
    const over = computeSettlement({ rounds: [round('online', 125010)], withholding: OTHER }); // 50,004
    expect(over.taxable).toBe(50004);
    expect(over.income_tax).toBe(10000); // 10,000.8 → 10원 미만 절사
    expect(over.local_tax).toBe(1000);
    expect(over.exempted).toBe(false);
  });

  it('10원 미만 절사: 소득세·지방세 각각 절사', () => {
    // gross 333,333 → taxable 133,333 → 소득세 26,666.6 → 26,660 → 지방세 2,666 → 2,660
    const r = computeSettlement({ rounds: [round('offline', 333333)], withholding: OTHER });
    expect(r.taxable).toBe(133333);
    expect(r.income_tax).toBe(26660);
    expect(r.local_tax).toBe(2660);
    expect(r.net).toBe(333333 - 29320);
  });

  it('회차 0건이면 전부 0', () => {
    const r = computeSettlement({ rounds: [], withholding: OTHER });
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
    expect(r.lines).toEqual([]);
    expect(r.exempted).toBe(false);
  });
});

describe('computeSettlement — 사업소득 / 없음', () => {
  it('사업소득 3.3%: 400,000 → 소득세 12,000 + 지방세 1,200 → 실지급 386,800', () => {
    const r = computeSettlement({ rounds: [round('offline', 100000), round('offline', 100000), round('offline', 100000), round('offline', 100000)], withholding: BUSINESS });
    expect(r.taxable).toBe(400000);
    expect(r.income_tax).toBe(12000);
    expect(r.local_tax).toBe(1200);
    expect(r.net).toBe(386800);
  });

  it('원천징수 없음: net = gross', () => {
    const r = computeSettlement({ rounds: [round('online', 80000), round('offline', 100000)], withholding: { method: 'none' } });
    expect(r.withholding).toBe(0);
    expect(r.net).toBe(180000);
  });
});

describe('멘토 2명 분할 (중도 종료 부분 정산)', () => {
  it('멘토별로 나누어 각각 계산하고, 섞어서 넣으면 거부한다', () => {
    const rounds = [round('offline', 100000, { mentor_id: 'A' }), round('offline', 100000, { mentor_id: 'A' }), round('online', 80000, { mentor_id: 'B' }), round('online', 80000, { mentor_id: 'B' })];
    expect(() => computeSettlement({ rounds, withholding: OTHER })).toThrow();
    const split = splitByMentor(rounds);
    const a = computeSettlement({ rounds: split.get('A')!, withholding: OTHER });
    const b = computeSettlement({ rounds: split.get('B')!, withholding: OTHER });
    expect(a.gross).toBe(200000);
    expect(a.taxable).toBe(80000);
    expect(a.withholding).toBe(16000 + 1600);
    expect(b.gross).toBe(160000);
    expect(b.taxable).toBe(64000);
    expect(b.withholding).toBe(12800 + 1280);
    const total = sumSettlements([a, b]);
    expect(total.gross).toBe(360000);
    expect(total.net).toBe(a.net + b.net);
  });
});

describe('policyFromParams · rounding · effectiveRate', () => {
  const params = {
    other_income: { expense_rate: 0.6, tax_rate: 0.2, local_rate: 0.1, rounding: 'floor_10', min_taxable_exempt: 50000 },
    business_income: { tax_rate: 0.03, local_rate: 0.1, rounding: 'floor_10' },
  };
  it('행사 설정 JSON 에서 정책을 만든다', () => {
    expect(policyFromParams('other_income', params)).toEqual(OTHER);
    expect(policyFromParams('business_income', params)).toEqual(BUSINESS);
    expect(policyFromParams('none', params)).toEqual({ method: 'none' });
  });
  it('파라미터가 없거나 범위를 벗어나면 throw (조용한 기본값 금지)', () => {
    expect(() => policyFromParams('other_income', {})).toThrow();
    expect(() => policyFromParams('business_income', { business_income: { tax_rate: 3, local_rate: 0.1 } })).toThrow();
  });
  it('실효세율: 기타소득 8.8%, 사업소득 3.3%', () => {
    expect(effectiveRate(OTHER)).toBeCloseTo(0.088, 6);
    expect(effectiveRate(BUSINESS)).toBeCloseTo(0.033, 6);
    expect(effectiveRate({ method: 'none' })).toBe(0);
  });
  it('applyRounding', () => {
    expect(applyRounding(12345.6, 'floor_10')).toBe(12340);
    expect(applyRounding(12345.6, 'floor_1')).toBe(12345);
    expect(applyRounding(12345.6, 'round')).toBe(12346);
    expect(applyRounding(-5, 'floor_10')).toBe(0);
  });
});
