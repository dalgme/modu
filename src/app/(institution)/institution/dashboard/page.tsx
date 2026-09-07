import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listCases } from '@/lib/data/cases';
import { listBatches } from '@/lib/data/settlements';
import { InstitutionDashboardBody } from '@/components/institution/institution-dashboard-body';

export default async function Page() {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const [cases, batches] = await Promise.all([
    listCases({ programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined }),
    listBatches(ctx.programId, ['submitted']),
  ]);
  return (
    <main className="flex flex-col gap-6">
      <InstitutionDashboardBody
        cases={cases}
        basePath="/institution/cases"
        branding={ctx.branding}
        groupName={ctx.group?.name ?? null}
        pendingBatches={batches.length}
      />
    </main>
  );
}
