import { describe, expect, it } from 'vitest';

import { pickRateRow } from '@/lib/settlement/rate-pick';
import { planReprice, type RepriceLog } from '@/lib/settlement/reprice-plan';

const G = 'group-a';
const rates = [
  { id: 'base-on', mode: 'online', unit_price: 80000, daily_cap_amount: 240000, effective_from: '2026-01-01', support_type_id: null, created_at: '2026-09-07' },
  { id: 'a-on-1001', mode: 'online', unit_price: 100000, daily_cap_amount: 300000, effective_from: '2026-10-01', support_type_id: G, created_at: '2026-11-02' },
  { id: 'base-off', mode: 'offline', unit_price: 100000, daily_cap_amount: 300000, effective_from: '2026-01-01', support_type_id: null, created_at: '2026-09-07' },
];
// 10:00~12:00 KST = 01:00~03:00Z
const log = (id: string, day: string, over: Partial<RepriceLog> = {}): RepriceLog => ({
  id, caseId: 'c1', groupId: G, mode: 'online', startedAt: `${day}T01:00:00Z`, endedAt: `${day}T03:00:00Z`, unitPrice: 80000, amount: 160000, rateId: 'base-on', settled: false, ...over,
});

describe('pickRateRow', () => {
  it('그룹 행이 있으면 그룹, 없으면 행사 기본', () => {
    expect(pickRateRow(rates, G, 'online', '2026-10-15')?.id).toBe('a-on-1001');
    expect(pickRateRow(rates, G, 'online', '2026-09-30')?.id).toBe('base-on');
    expect(pickRateRow(rates, 'other', 'online', '2026-10-15')?.id).toBe('base-on');
  });
  it('같은 적용일이면 나중에 만든 행', () => {
    const r = [...rates, { id: 'a-on-1001b', mode: 'online', unit_price: 90000, daily_cap_amount: 270000, effective_from: '2026-10-01', support_type_id: G, created_at: '2026-11-03' }];
    expect(pickRateRow(r, G, 'online', '2026-10-15')?.id).toBe('a-on-1001b');
  });
});

describe('planReprice', () => {
  it('소급 단가를 적용일 이후 미정산 회차에만 다시 적용한다', () => {
    const plan = planReprice([log('before', '2026-09-30'), log('after', '2026-10-08'), log('settled', '2026-10-08', { settled: true })], rates);
    expect(plan.map((p) => p.logId)).toEqual(['after']);
    expect(plan[0]).toMatchObject({ fromPrice: 80000, toPrice: 100000, fromAmount: 160000, toAmount: 200000, rateId: 'a-on-1001' });
  });
  it('이미 맞는 회차·다른 유형·범위 밖은 건드리지 않는다', () => {
    const ok = log('ok', '2026-10-08', { unitPrice: 100000, amount: 200000, rateId: 'a-on-1001' });
    const off = log('off', '2026-10-08', { mode: 'offline', unitPrice: 100000, amount: 200000, rateId: 'base-off' });
    expect(planReprice([ok, off], rates)).toEqual([]);
    expect(planReprice([log('x', '2026-10-08')], rates, { mode: 'offline' })).toEqual([]);
    expect(planReprice([log('x', '2026-10-08')], rates, { fromDate: '2026-10-09' })).toEqual([]);
    expect(planReprice([log('x', '2026-10-08')], rates, { groupId: 'other' })).toEqual([]);
  });
  it('KST 날짜 기준 — 자정 직후 회차', () => {
    // 2026-10-01 00:30 KST = 2026-09-30T15:30Z
    const l = log('kst', '2026-09-30', { startedAt: '2026-09-30T15:30:00Z', endedAt: '2026-09-30T16:30:00Z', amount: 80000 });
    expect(planReprice([l], rates)[0]).toMatchObject({ day: '2026-10-01', toPrice: 100000, toAmount: 100000 });
  });
  it('그룹멘토링 비대표 참여 회차는 0원 유지, 대표 회차만 새 단가', () => {
    const holder = log('h', '2026-10-08');
    const peer = log('p', '2026-10-08', { unitPrice: 0, amount: 0, feeZero: true });
    const plan = planReprice([holder, peer], rates);
    expect(plan.map((p) => p.logId)).toEqual(['h']);
    expect(plan[0]).toMatchObject({ toPrice: 100000, toAmount: 200000 });
  });
});
