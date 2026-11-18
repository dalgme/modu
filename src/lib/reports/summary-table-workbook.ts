import 'server-only';

import ExcelJS from 'exceljs';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { kstYmd } from '@/lib/utils/kst';
import { kstToday, safeName } from '@/lib/excel/sheet';
import { buildSummarySheet, sortSummaryRows, type SummaryRow } from '@/lib/reports/summary-table-sheet';

/**
 * 멘토링 총괄표 엑셀 (2026-11-18) — 보고서까지 등록된 회차 1건 = 1줄. group 없으면 행사 전체.
 * 제목 = 행사 설정 '멘토링 총괄표 제목'(없으면 "{연도} {행사명} 멘토링 총괄표"), 권역 = '총괄표 권역', 운영사 = 발주처 기관명.
 */
export async function buildSummaryTableWorkbook(programId: string, groupId: string | null): Promise<{ ok: true; buffer: Buffer; fileName: string; rows: number; missingTopics: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const [{ data: program }, groupRes] = await Promise.all([
    admin.from('programs').select('name, contract_title, summary_title, report_region, client_name').eq('id', programId).maybeSingle(),
    groupId ? admin.from('support_types').select('id, name, program_id').eq('id', groupId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!program) return { ok: false, error: '행사를 찾을 수 없습니다.' };
  const group = groupRes.data as { id: string; name: string; program_id: string } | null;
  if (groupId && (!group || group.program_id !== programId)) return { ok: false, error: '이 행사의 라운드(사업그룹)가 아닙니다.' };

  const cases = await fetchAll<{ id: string; owner_name: string }>((f, t) => {
    let q = admin.from('cases').select('id, owner_name').eq('program_id', programId);
    if (groupId) q = q.eq('support_type_id', groupId);
    return q.range(f, t);
  });
  const caseName = new Map(cases.map((c) => [c.id, c.owner_name]));
  const logs = await fetchAllIn<{ case_id: string; mentor_id: string; mode: string; started_at: string; ended_at: string; amount_snapshot: number; topic: string | null; report_topic: string | null }>(
    cases.map((c) => c.id),
    (chunk, f, t) => admin.from('mentoring_logs').select('case_id, mentor_id, mode, started_at, ended_at, amount_snapshot, topic, report_topic').in('case_id', chunk).not('report_registered_at', 'is', null).range(f, t),
  );
  const mentorIds = Array.from(new Set(logs.map((l) => l.mentor_id)));
  const users = await fetchAllIn<{ id: string; name: string }>(mentorIds, (chunk, f, t) => admin.from('users').select('id, name').in('id', chunk).range(f, t));
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  const region = (program.report_region as string | null)?.trim() ?? '';
  const operator = (program.client_name as string | null)?.trim() ?? '';
  const rows: SummaryRow[] = sortSummaryRows(
    logs.map((l) => ({
      region,
      operator,
      mentee: caseName.get(l.case_id) ?? '-',
      mentor: nameOf.get(l.mentor_id) ?? '-',
      date: kstYmd(l.started_at),
      hours: Math.round(((new Date(l.ended_at).getTime() - new Date(l.started_at).getTime()) / 3600000) * 100) / 100,
      mode: l.mode === 'offline' ? 'offline' : 'online',
      topic: (l.topic?.trim() || l.report_topic?.trim() || '') as string,
      amount: Number(l.amount_snapshot) || 0,
    })),
  );

  const today = kstToday();
  const title = (program.summary_title as string | null)?.trim() || `${today.slice(0, 4)} ${program.name} 멘토링 총괄표`;
  const wb = new ExcelJS.Workbook();
  buildSummarySheet(wb, { title: group ? `${title} (${group.name})` : title, rows });
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const contract = (program.contract_title as string | null) || program.name;
  const fileName = `멘토링 총괄표_${safeName(group?.name ?? '전체')}_${safeName(contract)}_${today.replace(/-/g, '').slice(2)}.xlsx`;
  return { ok: true, buffer, fileName, rows: rows.length, missingTopics: rows.filter((r) => !r.topic).length };
}
