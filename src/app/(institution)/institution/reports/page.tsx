import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listSupportTypes } from '@/lib/programs/data';
import { loadMatchingLists } from '@/lib/data/matching-lists';
import { loadReportData } from '@/lib/reports/page-data';
import { computeBudgetOverview } from '@/lib/reports/budget';
import { listDelayedCases } from '@/lib/reports/delays';
import { computeMonthlyTrend } from '@/lib/reports/trend';
import { REPORT_TABS, ReportsBody, type ReportTab } from '@/components/reports/reports-body';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: { tab?: string; group?: string; view?: string } }) {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const tab = (REPORT_TABS.find((t) => t.key === searchParams.tab)?.key ?? 'overview') as ReportTab;
  // 라운드(그룹)별 구분 탭 (P20)
  const groups = ctx.supportTypeId ? [] : await listSupportTypes(ctx.programId);
  const groupId = ctx.supportTypeId ?? groups.find((g) => g.id === searchParams.group)?.id ?? null;
  const { m, cases, settlements } = await loadReportData(ctx.programId, groupId);
  const budget = tab === 'overview' ? await computeBudgetOverview(ctx.programId, groupId) : undefined;
  const delays = tab === 'overview' ? await listDelayedCases(ctx.programId, groupId) : undefined;
  const trend = tab === 'trend' ? await computeMonthlyTrend(ctx.programId, groupId) : undefined;
  // 멘토 진행현황 = 그룹별(담당 인원)·담당 멘티명·회차·확정 실지급·만족도·운영사 평가 (P27-17)
  // 발주처에는 운영사 평가(메모·작성자)를 내려보내지 않는다 — 열을 숨기는 것과 별개로 페이로드에서 제거
  const mentorProgress = tab === 'cases' && searchParams.view === 'mentor' ? (await loadMatchingLists(ctx.programId, groupId)).mentorRows.map((r) => ({ ...r, reviews: [], reviewAvg: null })) : undefined;
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">리포트</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ctx.program.name}{ctx.group ? ` · ${ctx.group.name}` : ' · 행사 전체'} — 실시간 진행현황과 성과·정산 집계.</p>
      </div>
      <ReportsBody
        m={m}
        tab={tab}
        base="/institution"
        cases={cases}
        settlements={settlements}
        branding={ctx.branding}
        exportHref="/api/reports/export"
        groupFilter={ctx.supportTypeId ? undefined : { current: groupId, options: groups.map((g) => ({ id: g.id, name: g.name })) }}
        casesView={searchParams.view === 'mentor' ? 'mentor' : 'mentee'}
        mentorProgress={mentorProgress}
        budget={budget}
        delays={delays}
        trend={trend}
      />
    </main>
  );
}
