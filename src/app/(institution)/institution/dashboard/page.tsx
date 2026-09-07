import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listCases } from '@/lib/data/cases';
import { listBatches } from '@/lib/data/settlements';
import { computeProgramMetrics } from '@/lib/reports/metrics';
import { MetricsTiles } from '@/components/reports/metrics-tiles';
import { InstitutionDashboardBody } from '@/components/institution/institution-dashboard-body';

export default async function Page() {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const [cases, batches, metrics] = await Promise.all([
    listCases({ programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined }),
    listBatches(ctx.programId, ['submitted']),
    computeProgramMetrics(ctx.programId, ctx.supportTypeId ?? null),
  ]);
  return (
    <main className="flex flex-col gap-6">
      <InstitutionDashboardBody
        cases={cases}
        basePath="/institution/cases"
        branding={ctx.branding}
        groupName={ctx.group?.name ?? null}
        pendingBatches={batches.length}
        extra={<MetricsTiles m={metrics} base="/institution" reportsHref="/institution/reports" />}
      />
    </main>
  );
}
