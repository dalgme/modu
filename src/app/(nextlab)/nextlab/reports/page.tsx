import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listSupportTypes } from '@/lib/programs/data';
import { listProgramMentors } from '@/lib/data/mentors';
import { loadReportData } from '@/lib/reports/page-data';
import { computeBudgetOverview } from '@/lib/reports/budget';
import { listDelayedCases } from '@/lib/reports/delays';
import { computeMonthlyTrend } from '@/lib/reports/trend';
import { REPORT_TABS, ReportsBody, type ReportTab } from '@/components/reports/reports-body';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: { tab?: string; group?: string; view?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const tab = (REPORT_TABS.find((t) => t.key === searchParams.tab)?.key ?? 'overview') as ReportTab;
  // 라운드(그룹)별 구분 탭 (P20) — 그룹 컨텍스트가 없을 때만 화면 안 필터로 제공
  const groups = ctx.supportTypeId ? [] : await listSupportTypes(ctx.programId);
  const groupId = ctx.supportTypeId ?? groups.find((g) => g.id === searchParams.group)?.id ?? null;
  const { m, cases, settlements } = await loadReportData(ctx.programId, groupId);
  const budget = tab === 'overview' ? await computeBudgetOverview(ctx.programId, groupId) : undefined;
  const delays = tab === 'backlog' ? await listDelayedCases(ctx.programId, groupId) : undefined;
  const trend = tab === 'trend' ? await computeMonthlyTrend(ctx.programId, groupId) : undefined;
  // 멘토 진행현황 = 회원 명단의 멘토 명단 표와 동일 (P25-16)
  const mentorsRoster =
    tab === 'cases' && searchParams.view === 'mentor'
      ? { mentors: await listProgramMentors(ctx.programId, groupId), groups: (groups.length ? groups : await listSupportTypes(ctx.programId)).map((g) => ({ id: g.id, name: g.name })) }
      : undefined;
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">리포트</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ctx.program.name}{ctx.group ? ` · ${ctx.group.name}` : ' · 행사 전체'} — 수행 성과 · 잔여 과업 · 성과평가 · 정산.</p>
      </div>
      <ReportsBody
        m={m}
        tab={tab}
        base="/nextlab"
        cases={cases}
        settlements={settlements}
        branding={ctx.branding}
        exportHref="/api/reports/export"
        groupFilter={ctx.supportTypeId ? undefined : { current: groupId, options: groups.map((g) => ({ id: g.id, name: g.name })) }}
        casesView={searchParams.view === 'mentor' ? 'mentor' : 'mentee'}
        mentorsRoster={mentorsRoster}
        budget={budget}
        delays={delays}
        trend={trend}
      />
    </main>
  );
}
