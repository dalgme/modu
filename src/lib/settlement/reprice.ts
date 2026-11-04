import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { planReprice, type RepriceChange, type RepriceLog } from '@/lib/settlement/reprice-plan';

/**
 * 미정산 회차 단가 재적용 (2026-11-02) — 단가 행 추가·삭제 직후와 운영 설정 [단가·한도] 탭의 [현재 단가로 다시 맞추기]가 쓴다.
 * 계획은 순수 함수(reprice-plan.ts), 여기는 읽기·쓰기만. 정산에 들어간 회차(settlement_id)는 대상이 아니다.
 */
export interface RepriceScope {
  groupId?: string | null;
  mode?: 'online' | 'offline' | null;
  fromDate?: string | null;
}

export interface RepriceSummaryRow {
  groupId: string;
  groupName: string;
  mode: string;
  count: number;
  fromPrices: number[];
  toPrice: number;
  deltaAmount: number;
}

export async function planProgramReprice(programId: string, scope: RepriceScope = {}): Promise<{ changes: RepriceChange[]; summary: RepriceSummaryRow[] }> {
  const admin = createAdminClient();
  const [cases, rates, groups] = await Promise.all([
    fetchAll<{ id: string; support_type_id: string }>((f, t) => {
      let q = admin.from('cases').select('id, support_type_id').eq('program_id', programId);
      if (scope.groupId) q = q.eq('support_type_id', scope.groupId);
      return q.range(f, t);
    }),
    fetchAll<{ id: string; mode: string; unit_price: number; daily_cap_amount: number; effective_from: string; support_type_id: string | null; created_at: string }>((f, t) =>
      admin.from('consulting_rates').select('id, mode, unit_price, daily_cap_amount, effective_from, support_type_id, created_at').eq('program_id', programId).range(f, t),
    ),
    admin.from('support_types').select('id, name').eq('program_id', programId),
  ]);
  const groupOf = new Map(cases.map((c) => [c.id, c.support_type_id]));
  const rows = await fetchAllIn<{ id: string; case_id: string; mode: string; started_at: string; ended_at: string; unit_price_snapshot: number; amount_snapshot: number; rate_id: string | null; settlement_id: string | null; group_session_id: string | null; group_fee_holder: boolean }>(
    cases.map((c) => c.id),
    (chunk, f, t) => admin.from('mentoring_logs').select('id, case_id, mode, started_at, ended_at, unit_price_snapshot, amount_snapshot, rate_id, settlement_id, group_session_id, group_fee_holder').in('case_id', chunk).is('settlement_id', null).range(f, t),
  );
  const logs: RepriceLog[] = rows
    .filter((r) => r.started_at && r.ended_at)
    .map((r) => ({
      id: r.id,
      caseId: r.case_id,
      groupId: groupOf.get(r.case_id) ?? '',
      mode: r.mode,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      unitPrice: Number(r.unit_price_snapshot),
      amount: Number(r.amount_snapshot),
      rateId: r.rate_id,
      settled: !!r.settlement_id,
      feeZero: !!r.group_session_id && !r.group_fee_holder,
    }));
  const changes = planReprice(logs, rates, { groupId: scope.groupId ?? null, mode: scope.mode ?? null, fromDate: scope.fromDate ?? null });
  const nameOf = new Map((groups.data ?? []).map((g) => [g.id, g.name]));
  const agg = new Map<string, RepriceSummaryRow>();
  for (const c of changes) {
    const k = `${c.groupId}|${c.mode}|${c.toPrice}`;
    const cur = agg.get(k) ?? { groupId: c.groupId, groupName: nameOf.get(c.groupId) ?? '?', mode: c.mode, count: 0, fromPrices: [], toPrice: c.toPrice, deltaAmount: 0 };
    cur.count += 1;
    if (!cur.fromPrices.includes(c.fromPrice)) cur.fromPrices.push(c.fromPrice);
    cur.deltaAmount += c.toAmount - c.fromAmount;
    agg.set(k, cur);
  }
  const summary = Array.from(agg.values()).sort((a, b) => a.groupName.localeCompare(b.groupName, 'ko') || a.mode.localeCompare(b.mode));
  return { changes, summary };
}

/** 계획대로 반영 — 같은 (단가, 금액, 단가 행) 묶음별로 한 번에 update. 정산 편성 경합 방지로 settlement_id null 조건을 다시 건다. */
export async function applyReprice(changes: RepriceChange[]): Promise<{ updated: number; error?: string }> {
  const admin = createAdminClient();
  const groups = new Map<string, { price: number; amount: number; rateId: string; ids: string[] }>();
  for (const c of changes) {
    const k = `${c.toPrice}|${c.toAmount}|${c.rateId}`;
    const g = groups.get(k) ?? { price: c.toPrice, amount: c.toAmount, rateId: c.rateId, ids: [] };
    g.ids.push(c.logId);
    groups.set(k, g);
  }
  let updated = 0;
  for (const g of Array.from(groups.values())) {
    for (let i = 0; i < g.ids.length; i += 200) {
      const ids = g.ids.slice(i, i + 200);
      const { data, error } = await admin
        .from('mentoring_logs')
        .update({ unit_price_snapshot: g.price, amount_snapshot: g.amount, rate_id: g.rateId })
        .in('id', ids)
        .is('settlement_id', null)
        .select('id');
      if (error) return { updated, error: error.message };
      updated += data?.length ?? 0;
    }
  }
  return { updated };
}
