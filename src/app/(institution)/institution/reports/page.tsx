import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listSupportTypes } from '@/lib/programs/data';
import { loadMatchingLists } from '@/lib/data/matching-lists';
import { filterAndSortCases, loadReportData, parsePeriod, periodPresets } from '@/lib/reports/page-data';
import { computeBudgetOverview } from '@/lib/reports/budget';
import { listDelayedCases } from '@/lib/reports/delays';
import { computeMonthlyTrend } from '@/lib/reports/trend';
import { REPORT_TABS, ReportsBody, type ReportTab } from '@/components/reports/reports-body';

export const dynamic = 'force-dynamic';

type SP = { tab?: string; group?: string; view?: string; from?: string; to?: string; year?: string; status?: string; mentor?: string; q?: string; sort?: string };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const tab = (REPORT_TABS.find((t) => t.key === searchParams.tab)?.key ?? 'overview') as ReportTab;
  // 라운드(그룹)별 구분 탭 (P20) — 그룹 컨텍스트가 없을 때만 화면 안 필터로 제공
  const groups = ctx.supportTypeId ? [] : await listSupportTypes(ctx.programId);
  const groupId = ctx.supportTypeId ?? groups.find((g) => g.id === searchParams.group)?.id ?? null;
  // 기간 필터 (P30): 회차 = 보고서 등록일 · 정산 = 확정일 · 케이스 신규/종결 = 등록일/종결일
  const period = parsePeriod(searchParams);
  const { m, cases, settlements } = await loadReportData(ctx.programId, groupId, period);
  const budget = tab === 'overview' ? await computeBudgetOverview(ctx.programId, groupId) : undefined;
  const delays = tab === 'overview' ? await listDelayedCases(ctx.programId, groupId) : undefined;
  const year = searchParams.year && /^\d{4}$/.test(searchParams.year) ? Number(searchParams.year) : undefined;
  const trend = tab === 'trend' ? await computeMonthlyTrend(ctx.programId, groupId, year ? { year } : { months: 12 }) : undefined;
  // 멘토 진행현황 = 그룹별(담당 인원)·담당 멘티명·회차·확정 실지급·만족도·운영사 평가 (P27-17)
  // 발주처에는 운영사 평가(메모·작성자)를 내려보내지 않는다 — 열을 숨기는 것과 별개로 페이로드에서 제거
  const mentorProgress = tab === 'cases' && searchParams.view === 'mentor' ? (await loadMatchingLists(ctx.programId, groupId)).mentorRows.map((r) => ({ ...r, reviews: [], reviewAvg: null })) : undefined;
  const filtered = tab === 'cases' ? filterAndSortCases(cases, searchParams) : cases;
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">리포트</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ctx.program.name}{ctx.group ? ` · ${ctx.group.name}` : ' · 행사 전체'} — 실시간 진행현황과 성과·정산 집계. 기간은 아래 칩에서 바꿉니다.</p>
      </div>
      <ReportsBody
        m={m}
        tab={tab}
        base="/institution"
        cases={filtered}
        totalCases={cases.length}
        settlements={settlements}
        branding={ctx.branding}
        exportHref="/api/reports/export"
        groupFilter={ctx.supportTypeId ? undefined : { current: groupId, options: groups.map((g) => ({ id: g.id, name: g.name })) }}
        casesView={searchParams.view === 'mentor' ? 'mentor' : 'mentee'}
        mentorProgress={mentorProgress}
        budget={budget}
        delays={delays}
        trend={trend}
        period={period}
        periodPresets={periodPresets()}
        trendYear={year ?? null}
        caseFilterMentors={m.mentors.map((x) => ({ id: x.id, name: x.name }))}
      />
    </main>
  );
}
