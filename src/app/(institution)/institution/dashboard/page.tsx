import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { loadSettlementNeeded } from '@/lib/data/settlements';
import { computeProgramMetrics } from '@/lib/reports/metrics';
import { computeBudgetOverview } from '@/lib/reports/budget';
import { computeMonthlyTrend } from '@/lib/reports/trend';
import { listDelayedCases } from '@/lib/reports/delays';
import { InstitutionDashboardV2 } from '@/components/institution/institution-dashboard-v2';
import { loadInactiveMemberIds } from '@/lib/data/inactive-members';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** 발주처 대시보드 v2 (2026-10-01) — 정산 필요 카드 · 핵심 지표 · 차트 · 예산 · 바로가기 */
export default async function Page() {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const groupId = ctx.supportTypeId ?? null;
  // (2026-10-01) 비활성 회원(행사 비활성화·계정 잠금) 멘티의 케이스는 배정 대기·지연·핵심 지표에서 뺀다 — 운영사 대시보드와 같은 기준
  const inactiveMentees = await loadInactiveMemberIds(ctx.programId, 'mentee');
  const [metrics, budget, trend, allDelays, settlementNeeded] = await Promise.all([
    computeProgramMetrics(ctx.programId, groupId, null, { excludeMenteeIds: inactiveMentees }),
    computeBudgetOverview(ctx.programId, groupId),
    computeMonthlyTrend(ctx.programId, groupId),
    listDelayedCases(ctx.programId, groupId),
    loadSettlementNeeded(ctx.programId, groupId),
  ]);
  let delays = allDelays;
  if (inactiveMentees.size > 0 && allDelays.length > 0) {
    const { data: rows } = await createAdminClient().from('cases').select('id, mentee_id').in('id', allDelays.map((d) => d.caseId));
    const inactiveCase = new Set((rows ?? []).filter((r) => r.mentee_id && inactiveMentees.has(r.mentee_id)).map((r) => r.id));
    delays = allDelays.filter((d) => !inactiveCase.has(d.caseId));
  }
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
