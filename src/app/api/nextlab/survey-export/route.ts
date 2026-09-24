import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { buildCampaignExportData } from '@/lib/surveys/campaigns';
import { excelFileName, sheetName, sheetWithMeta, workbookBuffer, xlsxResponse } from '@/lib/excel/sheet';

export const dynamic = 'force-dynamic';

/** 레코드 배열 → 헤더(등장 순서 합집합) + 행 배열 */
function tabulate(records: Record<string, string | number>[]): { header: string[]; rows: unknown[][] } {
  const header: string[] = [];
  for (const r of records) for (const k of Object.keys(r)) if (!header.includes(k)) header.push(k);
  return { header, rows: records.map((r) => header.map((h) => r[h] ?? '')) };
}

/** 조사 응답 엑셀 — GET /api/nextlab/survey-export?id={campaignId} · 시트1 응답 요약(문항별) · 시트2 원자료(대상자별). 유형은 한국어, 일시는 KST (P31) */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const data = await buildCampaignExportData(id, ctx.programId);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const meta = { 범위: `${ctx.program.name} · ${data.scopeLabel}`, extra: [['조사', data.title], ['대상자', data.targets], ['응답', data.responded]] as [string, string | number][] };
  const summary = tabulate(data.summary.length ? data.summary : [{ 안내: '문항이 없습니다.' }]);
  const raw = tabulate(data.raw.length ? data.raw : [{ 안내: '대상자가 없습니다.' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetWithMeta(summary.header, summary.rows, meta), sheetName('응답 요약'));
  XLSX.utils.book_append_sheet(wb, sheetWithMeta(raw.header, raw.rows, meta), sheetName('원자료'));
  return xlsxResponse(workbookBuffer(wb), excelFileName(ctx.program.name, data.scopeLabel === '행사 전체' ? null : data.scopeLabel, `조사응답_${data.title}`));
}
