import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import type { CaseStatus } from '@/types/case-status';

/**
 * 멘토링 예산 집행 현황 (P22) — 예산은 지급총액(gross, 원천징수 공제 전) 기준.
 *  확정 = 정산 스냅샷 gross 합(취소 제외) / 예상 = 아직 정산에 묶이지 않은 이행(보고서 등록) 회차 단가 합.
 *  (P31) 확정을 단계별로 나눈다: approved(지급 대기·품의 편성) / clientConfirmed(발주처 정산 확인) / paid(지급 완료).
 *  기존 `confirmed`(= 세 단계 합) 는 호환용으로 유지. 화면·엑셀·발주처 정산 화면이 전부 이 함수를 쓴다.
 */
export interface BudgetRow {
  id: string | null; // null = 행사 전체
  name: string;
  budget: number | null;
  /** 확정 합계 (approved + clientConfirmed + paid) — 호환 */
  confirmed: number;
  forecast: number;
  /** (P31) 지급 대기 + 품의 편성 (운영사 확정, 발주처 확인 전) */
  approved: number;
  /** (P31) 발주처 정산 확인 (지급 전) */
  clientConfirmed: number;
  /** (P31) 지급 완료 */
  paid: number;
  /** (P31) 예산 대비 % (예산 없으면 null). 합계가 100 을 넘으면 초과 */
  gauge: { approved: number; clientConfirmed: number; paid: number; forecast: number; total: number; over: boolean } | null;
}

export interface BudgetOverview {
  total: BudgetRow;
  groups: BudgetRow[];
}

type Acc = { approved: number; clientConfirmed: number; paid: number; forecast: number };
const acc = (): Acc => ({ approved: 0, clientConfirmed: 0, paid: 0, forecast: 0 });

function toRow(id: string | null, name: string, budget: number | null, a: Acc): BudgetRow {
  const confirmed = a.approved + a.clientConfirmed + a.paid;
  const pct = (v: number) => (budget && budget > 0 ? Math.round((v / budget) * 1000) / 10 : 0);
  const total = confirmed + a.forecast;
  return {
    id,
    name,
    budget,
    confirmed,
    forecast: a.forecast,
    approved: a.approved,
    clientConfirmed: a.clientConfirmed,
    paid: a.paid,
    gauge: budget && budget > 0 ? { approved: pct(a.approved), clientConfirmed: pct(a.clientConfirmed), paid: pct(a.paid), forecast: pct(a.forecast), total: pct(total), over: total > budget } : null,
  };
}

export async function computeBudgetOverview(programId: string, supportTypeId?: string | null): Promise<BudgetOverview> {
  const admin = createAdminClient();
  const [{ data: program }, { data: groups }, { data: cases }] = await Promise.all([
    admin.from('programs').select('name, mentoring_budget').eq('id', programId).maybeSingle(),
    admin.from('support_types').select('id, name, mentoring_budget').eq('program_id', programId).order('sort_order'),
    admin.from('cases').select('id, support_type_id').eq('program_id', programId),
  ]);
  const caseGroup = new Map((cases ?? []).map((c) => [c.id, c.support_type_id]));
  const caseIds = Array.from(caseGroup.keys());

  const byGroup = new Map<string, Acc>();
  const get = (g: string) => {
    const cur = byGroup.get(g) ?? acc();
    byGroup.set(g, cur);
    return cur;
  };
  if (caseIds.length) {
    const [settlements, logs] = await Promise.all([
      fetchAllIn<{ case_id: string; gross: number; status: string }>(caseIds, (chunk, from, to) => admin.from('settlements').select('case_id, gross, status').in('case_id', chunk).neq('status', 'canceled').range(from, to)),
      fetchAllIn<{ case_id: string; amount_snapshot: number }>(caseIds, (chunk, from, to) => admin.from('mentoring_logs').select('case_id, amount_snapshot').in('case_id', chunk).not('report_registered_at', 'is', null).is('settlement_id', null).range(from, to)),
    ]);
    for (const s of settlements) {
      const g = caseGroup.get(s.case_id);
      if (!g) continue;
      const a = get(g);
      const v = Number(s.gross);
      if (s.status === 'paid') a.paid += v;
      else if (s.status === 'confirmed') a.clientConfirmed += v;
      else a.approved += v;
    }
    for (const l of logs) {
      const g = caseGroup.get(l.case_id);
      if (g) get(g).forecast += Number(l.amount_snapshot);
    }
  }

  const groupRows: BudgetRow[] = (groups ?? [])
    .filter((g) => !supportTypeId || g.id === supportTypeId)
    .map((g) => toRow(g.id, g.name, g.mentoring_budget === null ? null : Number(g.mentoring_budget), byGroup.get(g.id) ?? acc()));

  const total: BudgetRow = supportTypeId
    ? (groupRows[0] ?? toRow(supportTypeId, '-', null, acc()))
    : toRow(
        null,
        program?.name ?? '행사 전체',
        program?.mentoring_budget === null || program?.mentoring_budget === undefined ? null : Number(program.mentoring_budget),
        groupRows.reduce((a, g) => ({ approved: a.approved + g.approved, clientConfirmed: a.clientConfirmed + g.clientConfirmed, paid: a.paid + g.paid, forecast: a.forecast + g.forecast }), acc()),
      );

  return { total, groups: supportTypeId ? [] : groupRows };
}

/**
 * (P31) 케이스별 예상 지출(검수 전) — 정산에 묶이지 않은 이행 회차의 단가 합. 발주처 [지출 예상] 표가 쓴다.
 * computeBudgetOverview 의 forecast 와 같은 조건(보고서 등록 · settlement_id null) 이라 합계가 게이지와 일치한다.
 */
export interface ForecastCaseRow {
  id: string;
  ownerName: string;
  businessName: string;
  groupName: string;
  status: CaseStatus;
  rounds: number;
  amount: number;
}

export async function computeForecastByCase(programId: string, supportTypeId?: string | null): Promise<{ rows: ForecastCaseRow[]; total: number }> {
  const admin = createAdminClient();
  let q = admin.from('cases').select('id, owner_name, business_name, status, support_types(name)').eq('program_id', programId).not('status', 'in', '(closed,withdrawn)');
  if (supportTypeId) q = q.eq('support_type_id', supportTypeId);
  const { data: openCases } = await q;
  const caseIds = (openCases ?? []).map((c) => c.id);
  const logs = await fetchAllIn<{ case_id: string; amount_snapshot: number }>(caseIds, (chunk, from, to) => admin.from('mentoring_logs').select('case_id, amount_snapshot').in('case_id', chunk).not('report_registered_at', 'is', null).is('settlement_id', null).range(from, to));
  const byCase = new Map<string, { amount: number; rounds: number }>();
  for (const l of logs) {
    const cur = byCase.get(l.case_id) ?? { amount: 0, rounds: 0 };
    cur.amount += Number(l.amount_snapshot);
    cur.rounds += 1;
    byCase.set(l.case_id, cur);
  }
  const rows = (openCases ?? [])
    .filter((c) => byCase.has(c.id))
    .map((c) => ({
      id: c.id,
      ownerName: c.owner_name,
      businessName: c.business_name,
      groupName: (c.support_types as unknown as { name: string } | null)?.name ?? '-',
      status: c.status as CaseStatus,
      rounds: byCase.get(c.id)!.rounds,
      amount: byCase.get(c.id)!.amount,
    }))
    .sort((a, b) => b.amount - a.amount);
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0) };
}
