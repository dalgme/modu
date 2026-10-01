import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { allocateWithholding, computeSettlement, type SettlementRoundInput } from '@/lib/settlement/compute';
import { resolveWithholding, type ResolvedWithholding } from '@/lib/settlement/policy';

/**
 * 회차별 상세 (2026-10-01, 매칭 리스트 엑셀) — 일시·시수·장소·보고서 제출·수당·세금분·실지급분.
 *  - 정산 확정 회차: 그 정산 스냅샷의 원천징수 합계를 회차 금액 비례로 배분(allocateWithholding) → 합계가 확정액과 일치
 *  - 보고서 등록·미정산 회차: 확정과 같은 computeSettlement 로 케이스×멘토 예상 원천징수를 계산해 배분(estimated=true)
 *  - 계획만 있는 회차(보고서 전): 일시·시수·장소만, 금액은 비움(이행 전이라 지급 대상 아님)
 */
export interface RoundCell {
  roundNo: number;
  mentorId: string;
  startedAt: string;
  endedAt: string;
  hours: number;
  place: string | null;
  reported: boolean;
  allowance: number | null;
  tax: number | null;
  net: number | null;
  estimated: boolean;
}

type LogRow = {
  id: string;
  case_id: string;
  round_no: number;
  mode: 'online' | 'offline';
  started_at: string;
  ended_at: string;
  place: string | null;
  report_registered_at: string | null;
  unit_price_snapshot: number;
  amount_snapshot: number;
  is_extra: boolean;
  mentor_id: string;
  settlement_id: string | null;
};

export async function loadRoundBreakdown(programId: string, cases: { id: string; support_type_id: string }[]): Promise<{ byCase: Map<string, RoundCell[]>; maxRound: number }> {
  const admin = createAdminClient();
  const byCase = new Map<string, RoundCell[]>();
  if (cases.length === 0) return { byCase, maxRound: 0 };
  const groupOf = new Map(cases.map((c) => [c.id, c.support_type_id]));
  const logs = await fetchAllIn<LogRow>(cases.map((c) => c.id), (chunk, from, to) =>
    admin
      .from('mentoring_logs')
      .select('id, case_id, round_no, mode, started_at, ended_at, place, report_registered_at, unit_price_snapshot, amount_snapshot, is_extra, mentor_id, settlement_id')
      .in('case_id', chunk)
      .order('round_no')
      .range(from, to),
  );
  const settlementIds = Array.from(new Set(logs.map((l) => l.settlement_id).filter((x): x is string => !!x)));
  const settlements = await fetchAllIn<{ id: string; withholding: number; status: string }>(settlementIds, (chunk, from, to) => admin.from('settlements').select('id, withholding, status').in('id', chunk).range(from, to));
  const settlementTax = new Map(settlements.filter((s) => s.status !== 'canceled').map((s) => [s.id, Number(s.withholding)]));

  const taxByLog = new Map<string, { tax: number; estimated: boolean }>();
  // ① 확정 회차 — 정산별 배분
  const bySettlement = new Map<string, LogRow[]>();
  for (const l of logs) if (l.settlement_id && l.report_registered_at && settlementTax.has(l.settlement_id)) bySettlement.set(l.settlement_id, [...(bySettlement.get(l.settlement_id) ?? []), l]);
  for (const [sid, rows] of Array.from(bySettlement.entries())) {
    const parts = allocateWithholding(rows.map((r) => Number(r.amount_snapshot)), settlementTax.get(sid) ?? 0);
    rows.forEach((r, i) => taxByLog.set(r.id, { tax: parts[i] ?? 0, estimated: false }));
  }
  // ② 미정산 이행 회차 — 케이스×멘토 예상(확정과 같은 계산 함수)
  const pending = new Map<string, LogRow[]>();
  for (const l of logs) if (l.report_registered_at && !(l.settlement_id && settlementTax.has(l.settlement_id))) pending.set(`${l.case_id}:${l.mentor_id}`, [...(pending.get(`${l.case_id}:${l.mentor_id}`) ?? []), l]);
  const policyCache = new Map<string, Promise<ResolvedWithholding | null>>();
  const policyFor = (groupId: string, mentorId: string) => {
    const key = `${groupId}:${mentorId}`;
    if (!policyCache.has(key)) policyCache.set(key, resolveWithholding(programId, groupId, mentorId).catch(() => null));
    return policyCache.get(key)!;
  };
  await Promise.all(
    Array.from(pending.entries()).map(async ([key, rows]) => {
      const [caseId, mentorId] = key.split(':') as [string, string];
      const policy = await policyFor(groupOf.get(caseId) ?? '', mentorId);
      if (!policy) return;
      const input: SettlementRoundInput[] = rows.map((r) => ({ log_id: r.id, round_no: r.round_no, mode: r.mode, started_at: r.started_at, unit_price_snapshot: Number(r.unit_price_snapshot), amount_snapshot: Number(r.amount_snapshot), is_extra: r.is_extra, mentor_id: r.mentor_id }));
      const result = computeSettlement({ rounds: input, withholding: policy.policy });
      const parts = allocateWithholding(rows.map((r) => Number(r.amount_snapshot)), result.withholding);
      rows.forEach((r, i) => taxByLog.set(r.id, { tax: parts[i] ?? 0, estimated: true }));
    }),
  );

  let maxRound = 0;
  for (const l of logs) {
    maxRound = Math.max(maxRound, l.round_no);
    const t = taxByLog.get(l.id);
    const reported = !!l.report_registered_at;
    const allowance = reported ? Number(l.amount_snapshot) : null;
    const hours = Math.round(((new Date(l.ended_at).getTime() - new Date(l.started_at).getTime()) / 3600000) * 10) / 10;
    const cell: RoundCell = {
      roundNo: l.round_no,
      mentorId: l.mentor_id,
      startedAt: l.started_at,
      endedAt: l.ended_at,
      hours: Number.isFinite(hours) ? hours : 0,
      place: l.place,
      reported,
      allowance,
      tax: reported ? (t?.tax ?? null) : null,
      net: reported && t ? (allowance ?? 0) - t.tax : null,
      estimated: !!t?.estimated,
    };
    byCase.set(l.case_id, [...(byCase.get(l.case_id) ?? []), cell]);
  }
  return { byCase, maxRound };
}

/** 회차별 엑셀 머리글 — 회차마다 7칸 */
export const ROUND_FIELDS = ['일시', '시수', '장소', '보고서 제출', '수당', '세금분', '실지급분'] as const;

export function roundHeader(maxRound: number): string[] {
  const out: string[] = [];
  for (let n = 1; n <= maxRound; n++) for (const f of ROUND_FIELDS) out.push(`${n}회차 ${f}`);
  return out;
}

/** 한 케이스(또는 그 케이스 중 한 멘토가 진행한 회차)의 회차별 값 — roundHeader 와 같은 순서 */
export function roundValues(cells: RoundCell[] | undefined, maxRound: number, fmtWhen: (start: string, end: string) => string, mentorId?: string): (string | number)[] {
  const byNo = new Map((cells ?? []).filter((c) => !mentorId || c.mentorId === mentorId).map((c) => [c.roundNo, c]));
  const out: (string | number)[] = [];
  for (let n = 1; n <= maxRound; n++) {
    const c = byNo.get(n);
    if (!c) {
      out.push('', '', '', '', '', '', '');
      continue;
    }
    out.push(fmtWhen(c.startedAt, c.endedAt), c.hours, c.place ?? '', c.reported ? '제출' : '미제출', c.allowance ?? '', c.tax ?? '', c.net ?? '');
  }
  return out;
}
