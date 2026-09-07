import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { loadReportData } from '@/lib/reports/page-data';
import { REPORT_TABS, ReportsBody, type ReportTab } from '@/components/reports/reports-body';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const tab = (REPORT_TABS.find((t) => t.key === searchParams.tab)?.key ?? 'overview') as ReportTab;
  const { m, cases, settlements } = await loadReportData(ctx.programId, ctx.supportTypeId ?? null);
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">리포트</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ctx.program.name}{ctx.group ? ` · ${ctx.group.name}` : ' · 행사 전체'} — 수행 성과 · 잔여 과업 · 성과평가 · 정산.</p>
      </div>
      <ReportsBody m={m} tab={tab} base="/nextlab" cases={cases} settlements={settlements} branding={ctx.branding} exportHref="/api/reports/export" />
    </main>
  );
}
