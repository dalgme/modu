import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { loadSettlementNeeded } from '@/lib/data/settlements';
import { computeProgramMetrics } from '@/lib/reports/metrics';
import { computeBudgetOverview } from '@/lib/reports/budget';
import { computeMonthlyTrend } from '@/lib/reports/trend';
import { listDelayedCases } from '@/lib/reports/delays';
import { InstitutionDashboardV2 } from '@/components/institution/institution-dashboard-v2';

export const dynamic = 'force-dynamic';

/** 발주처 대시보드 v2 (2026-10-01) — 정산 필요 카드 · 핵심 지표 · 차트 · 예산 · 바로가기 */
export default async function Page() {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const groupId = ctx.supportTypeId ?? null;
  const [metrics, budget, trend, delays, settlementNeeded] = await Promise.all([
    computeProgramMetrics(ctx.programId, groupId),
    computeBudgetOverview(ctx.programId, groupId),
    computeMonthlyTrend(ctx.programId, groupId),
    listDelayedCases(ctx.programId, groupId),
    loadSettlementNeeded(ctx.programId, groupId),
  ]);
  return (
    <main className="flex flex-col gap-6">
      <InstitutionDashboardV2
        branding={ctx.branding}
        scopeLabel={ctx.group ? ctx.group.name : '행사 전체'}
        metrics={metrics}
        budget={budget}
        trend={trend}
        delays={delays.length}
        settlementNeeded={settlementNeeded}
      />
    </main>
  );
}
