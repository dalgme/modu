import { notFound } from 'next/navigation';

import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getCaseById, getCaseStatusHistory, listPredecessorCases } from '@/lib/data/cases';
import { CaseDetailShell } from '@/components/cases/case-detail-shell';
import { CaseDetailBackNav } from '@/components/cases/case-detail-back-nav';
import { OperatorRequestButton } from '@/components/cases/operator-request-button';

export const maxDuration = 60;

export default async function Page({ params }: { params: { id: string } }) {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const item = await getCaseById(params.id);
  if (!item || item.program_id !== ctx.programId) notFound();

  const [history, predecessors] = await Promise.all([getCaseStatusHistory(item.id), listPredecessorCases(item.id)]);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <CaseDetailBackNav dashboardHref="/institution/dashboard" />
        <OperatorRequestButton caseId={item.id} businessName={item.business_name} ownerName={item.owner_name} phone={item.phone} />
      </div>
      <CaseDetailShell
        item={item}
        history={history}
        predecessors={predecessors}
        branding={ctx.branding}
        basePath="/institution/cases"
      />
    </main>
  );
}
