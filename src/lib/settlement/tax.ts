import 'server-only';

import * as XLSX from 'xlsx';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';

/**
 * (P31) 원천세 신고 보조 집계 — **지급일(paid_at) 기준**. 확정일이 아니라 실제 지급된 달로 귀속한다.
 *  월별 × 원천징수 방식: 인원(멘토 수)·총지급(gross)·소득세·지방소득세·실지급
 *  연간 × 멘토: 지급 건수·총지급·소득세·지방소득세·원천징수·실지급
 * 화면(정산 › 원천세 탭)과 엑셀(/api/nextlab/tax-export)이 같은 함수를 쓴다.
 */
export interface TaxMonthRow {
  month: string; // YYYY-MM (KST)
  method: string;
  methodLabel: string;
  mentors: number;
  count: number;
  gross: number;
  incomeTax: number;
  localTax: number;
  withholding: number;
  net: number;
}
export interface TaxMentorRow {
  year: string;
  mentorId: string;
  mentorName: string;
  method: string;
  methodLabel: string;
  count: number;
  gross: number;
  incomeTax: number;
  localTax: number;
  withholding: number;
  net: number;
}
export interface TaxSummary {
  basis: 'paid_at';
  scope: { programId: string; supportTypeId: string | null; year: number | null };
  months: TaxMonthRow[];
  mentors: TaxMentorRow[];
  years: string[];
}

type PaidRow = { id: string; case_id: string; mentor_id: string; gross: number; income_tax: number; local_tax: number; withholding: number; net: number; withholding_method: string; paid_at: string | null };

const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const methodLabel = (m: string) => WITHHOLDING_LABELS[m as keyof typeof WITHHOLDING_LABELS] ?? m;

export async function computeTaxSummary(programId: string, supportTypeId?: string | null, year?: number | null): Promise<TaxSummary> {
  const admin = createAdminClient();
  const rows = await fetchAll<PaidRow>((from, to) =>
    admin.from('settlements').select('id, case_id, mentor_id, gross, income_tax, local_tax, withholding, net, withholding_method, paid_at').eq('program_id', programId).eq('status', 'paid').not('paid_at', 'is', null).order('paid_at').range(from, to),
  );
  let paid = rows;
  if (supportTypeId) {
    const caseIds = Array.from(new Set(rows.map((r) => r.case_id)));
    const cases = await fetchAllIn<{ id: string; support_type_id: string }>(caseIds, (chunk, from, to) => admin.from('cases').select('id, support_type_id').in('id', chunk).range(from, to));
    const ok = new Set(cases.filter((c) => c.support_type_id === supportTypeId).map((c) => c.id));
    paid = rows.filter((r) => ok.has(r.case_id));
  }
  const years = Array.from(new Set(paid.map((r) => kstDay(r.paid_at!).slice(0, 4)))).sort();
  if (year) paid = paid.filter((r) => kstDay(r.paid_at!).startsWith(String(year)));

  const mentorIds = Array.from(new Set(paid.map((r) => r.mentor_id)));
  const { data: users } = mentorIds.length ? await admin.from('users').select('id, name').in('id', mentorIds) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((users ?? []).map((u) => [u.id, u.name]));

  const monthMap = new Map<string, TaxMonthRow & { mentorSet: Set<string> }>();
  const mentorMap = new Map<string, TaxMentorRow>();
  for (const r of paid) {
    const day = kstDay(r.paid_at!);
    const month = day.slice(0, 7);
    const y = day.slice(0, 4);
    const mk = `${month}|${r.withholding_method}`;
    const m = monthMap.get(mk) ?? { month, method: r.withholding_method, methodLabel: methodLabel(r.withholding_method), mentors: 0, count: 0, gross: 0, incomeTax: 0, localTax: 0, withholding: 0, net: 0, mentorSet: new Set<string>() };
    m.count += 1;
    m.gross += Number(r.gross);
    m.incomeTax += Number(r.income_tax);
    m.localTax += Number(r.local_tax);
    m.withholding += Number(r.withholding);
    m.net += Number(r.net);
    m.mentorSet.add(r.mentor_id);
    monthMap.set(mk, m);
    const yk = `${y}|${r.mentor_id}|${r.withholding_method}`;
    const t = mentorMap.get(yk) ?? { year: y, mentorId: r.mentor_id, mentorName: nameOf.get(r.mentor_id) ?? '-', method: r.withholding_method, methodLabel: methodLabel(r.withholding_method), count: 0, gross: 0, incomeTax: 0, localTax: 0, withholding: 0, net: 0 };
    t.count += 1;
    t.gross += Number(r.gross);
    t.incomeTax += Number(r.income_tax);
    t.localTax += Number(r.local_tax);
    t.withholding += Number(r.withholding);
    t.net += Number(r.net);
    mentorMap.set(yk, t);
  }
  const months = Array.from(monthMap.values())
    .map(({ mentorSet, ...m }) => ({ ...m, mentors: mentorSet.size }))
    .sort((a, b) => a.month.localeCompare(b.month) || a.method.localeCompare(b.method));
  const mentors = Array.from(mentorMap.values()).sort((a, b) => a.year.localeCompare(b.year) || a.mentorName.localeCompare(b.mentorName, 'ko') || a.method.localeCompare(b.method));
  return { basis: 'paid_at', scope: { programId, supportTypeId: supportTypeId ?? null, year: year ?? null }, months, mentors, years };
}

/** 원천세 엑셀 — 월별×방식 · 연간×멘토 두 시트 (화면과 같은 computeTaxSummary 결과) */
export function buildTaxWorkbook(t: TaxSummary, programName: string, groupName: string | null): Buffer {
  const title = `${programName}${groupName ? ` · ${groupName}` : ''} — 원천세 집계 (지급일 기준${t.scope.year ? `, ${t.scope.year}년` : ''})`;
  const monthly = XLSX.utils.aoa_to_sheet([
    [title],
    [],
    ['귀속연월', '원천징수 방식', '인원', '건수', '총지급(세전)', '소득세', '지방소득세', '원천징수 합계', '실지급'],
    ...t.months.map((m) => [m.month, m.methodLabel, m.mentors, m.count, m.gross, m.incomeTax, m.localTax, m.withholding, m.net]),
    ['합계', '', '', t.months.reduce((a, m) => a + m.count, 0), t.months.reduce((a, m) => a + m.gross, 0), t.months.reduce((a, m) => a + m.incomeTax, 0), t.months.reduce((a, m) => a + m.localTax, 0), t.months.reduce((a, m) => a + m.withholding, 0), t.months.reduce((a, m) => a + m.net, 0)],
  ]);
  const yearly = XLSX.utils.aoa_to_sheet([
    [title],
    [],
    ['연도', '멘토', '원천징수 방식', '지급 건수', '총지급(세전)', '소득세', '지방소득세', '원천징수 합계', '실지급'],
    ...t.mentors.map((m) => [m.year, m.mentorName, m.methodLabel, m.count, m.gross, m.incomeTax, m.localTax, m.withholding, m.net]),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, monthly, '월별 원천세');
  XLSX.utils.book_append_sheet(wb, yearly, '연간 멘토별');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}
