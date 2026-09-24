import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { loadReportData, parsePeriod } from '@/lib/reports/page-data';
import { buildReportWorkbook, reportFileName } from '@/lib/reports/export';
import { computeMonthlyTrend } from '@/lib/reports/trend';
import { loadMatchingLists } from '@/lib/data/matching-lists';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 리포트 엑셀 — 운영사·발주처 (행사 컨텍스트 범위 + 기간·연도·보기 파라미터는 화면과 동일, P30) */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const sp = new URL(request.url).searchParams;
  const tab = sp.get('tab') ?? 'overview';
  const period = parsePeriod({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined });
  const yearRaw = sp.get('year');
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : undefined;
  const groupId = ctx.supportTypeId ?? sp.get('group') ?? null;
  const { m, cases, settlements } = await loadReportData(ctx.programId, groupId, period);
  const [trend, lists] = await Promise.all([
    tab === 'trend' ? computeMonthlyTrend(ctx.programId, groupId, year ? { year } : { months: 12 }) : Promise.resolve(undefined),
    tab === 'cases' && sp.get('view') === 'mentor' ? loadMatchingLists(ctx.programId, groupId) : Promise.resolve(undefined),
  ]);
  const buf = buildReportWorkbook(tab, m, cases, settlements, ctx.program.name, { trend, mentorProgress: lists?.mentorRows });
  const filename = encodeURIComponent(reportFileName(ctx.program.name, tab, m));
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
