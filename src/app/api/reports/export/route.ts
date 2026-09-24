import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { caseFilterLabel, filterAndSortCases, loadReportData, parsePeriod } from '@/lib/reports/page-data';
import { buildReportWorkbook, reportFileName } from '@/lib/reports/export';
import { computeMonthlyTrend } from '@/lib/reports/trend';
import { loadMatchingLists } from '@/lib/data/matching-lists';
import { listDelayedCases } from '@/lib/reports/delays';
import { computeBudgetOverview } from '@/lib/reports/budget';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 리포트 엑셀 — 운영사·발주처 (행사 컨텍스트 범위 + 기간·연도·보기·표 필터 파라미터는 화면과 동일, P30·P31)
 * `?tab=&from=&to=&year=&view=mentor&status=&mentor=&q=&sort=` — 진행현황(cases) 탭은 화면과 같은 filterAndSortCases 를 적용한다.
 */
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
  const view = sp.get('view') === 'mentor' ? 'mentor' : 'mentee';
  const params = { status: sp.get('status') ?? undefined, mentor: sp.get('mentor') ?? undefined, q: sp.get('q') ?? undefined, sort: sp.get('sort') ?? undefined, view };
  const { m, cases: allCases, settlements } = await loadReportData(ctx.programId, groupId, period);
  const cases = tab === 'cases' ? filterAndSortCases(allCases, params) : allCases;
  const admin = createAdminClient();
  const [trend, lists, delays, budget, profiles] = await Promise.all([
    tab === 'trend' || tab === 'overview' ? computeMonthlyTrend(ctx.programId, groupId, year ? { year } : { months: 12 }) : Promise.resolve(undefined),
    (tab === 'cases' && view === 'mentor') || tab === 'mentors' ? loadMatchingLists(ctx.programId, groupId) : Promise.resolve(undefined),
    tab === 'overview' ? listDelayedCases(ctx.programId, groupId) : Promise.resolve(undefined),
    tab === 'overview' ? computeBudgetOverview(ctx.programId, groupId) : Promise.resolve(undefined),
    tab === 'cases' || tab === 'overview'
      ? fetchAllIn<{ case_id: string; external_no: string | null; rank: number | null }>(cases.map((c) => c.id), (chunk, from, to) => admin.from('mentee_profiles').select('case_id, external_no, rank').in('case_id', chunk).range(from, to))
      : Promise.resolve([] as { case_id: string; external_no: string | null; rank: number | null }[]),
  ]);
  const caseExtras: Record<string, { externalNo: string | null; rank: number | null }> = {};
  for (const p of profiles) caseExtras[p.case_id] = { externalNo: p.external_no, rank: p.rank };
  const mentorName = params.mentor ? (allCases.find((c) => c.mentorId === params.mentor)?.mentorName ?? null) : null;
  const scopeName = ctx.group?.name ?? (groupId ? (m.groups.find((g) => g.id === groupId)?.name ?? null) : null);
  const buf = buildReportWorkbook(tab, m, cases, settlements, ctx.program.name, {
    trend,
    mentorProgress: lists?.mentorRows,
    delays,
    budget,
    role: ctx.role === 'institution' ? 'institution' : 'nextlab',
    scopeName,
    filterLabel: tab === 'cases' ? [view === 'mentor' ? '멘토 진행현황' : null, caseFilterLabel(params, mentorName)].filter(Boolean).join(' · ') || null : null,
    caseExtras,
  });
  const filename = encodeURIComponent(reportFileName(ctx.program.name, tab, m, scopeName));
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
