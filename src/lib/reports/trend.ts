import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/** 월별 추이 (P22) — 최근 12개월(KST). 발주처 월간 보고 대응. */
export interface TrendMonth {
  /** YYYY-MM */
  month: string;
  /** 이행(보고서 등록) 회차 수 — 등록 시점 기준 */
  rounds: number;
  /** 확정 지급총액(gross, 취소 제외) — 정산 확정 시점 기준 */
  settledGross: number;
  /** 신규 등록 케이스 수 */
  newCases: number;
  /** 종결(closed) 케이스 수 */
  closedCases: number;
}

const kstMonth = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export async function computeMonthlyTrend(programId: string, supportTypeId?: string | null, months = 12): Promise<TrendMonth[]> {
  const admin = createAdminClient();
  let casesQ = admin.from('cases').select('id, created_at, closed_at').eq('program_id', programId);
  if (supportTypeId) casesQ = casesQ.eq('support_type_id', supportTypeId);
  const { data: cases } = await casesQ;
  const caseIds = (cases ?? []).map((c) => c.id);

  const [{ data: logs }, { data: settlements }] = caseIds.length
    ? await Promise.all([
        admin.from('mentoring_logs').select('case_id, report_registered_at').in('case_id', caseIds).not('report_registered_at', 'is', null),
        admin.from('settlements').select('case_id, gross, confirmed_at, created_at, status').in('case_id', caseIds).neq('status', 'canceled'),
      ])
    : [{ data: [] as { case_id: string; report_registered_at: string | null }[] }, { data: [] as { case_id: string; gross: number; confirmed_at: string | null; created_at: string; status: string }[] }];

  // 최근 N개월 버킷 (이번 달 포함)
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const buckets: TrendMonth[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({
      month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      rounds: 0,
      settledGross: 0,
      newCases: 0,
      closedCases: 0,
    });
  }
  const byMonth = new Map(buckets.map((b) => [b.month, b]));

  for (const l of logs ?? []) {
    const m = kstMonth(l.report_registered_at);
    if (m && byMonth.has(m)) byMonth.get(m)!.rounds += 1;
  }
  for (const s of settlements ?? []) {
    const m = kstMonth(s.confirmed_at ?? s.created_at);
    if (m && byMonth.has(m)) byMonth.get(m)!.settledGross += Number(s.gross);
  }
  for (const c of cases ?? []) {
    const created = kstMonth(c.created_at);
    if (created && byMonth.has(created)) byMonth.get(created)!.newCases += 1;
    const closed = kstMonth(c.closed_at);
    if (closed && byMonth.has(closed)) byMonth.get(closed)!.closedCases += 1;
  }
  return buckets;
}
