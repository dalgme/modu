import { notFound } from 'next/navigation';

import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getCaseById, getCaseStatusHistory, listPredecessorCases } from '@/lib/data/cases';
import { CaseDetailShell } from '@/components/cases/case-detail-shell';
import { CaseDetailBackNav } from '@/components/cases/case-detail-back-nav';
import { OperatorRequestButton } from '@/components/cases/operator-request-button';
import { getObservationReportFile, listRounds } from '@/lib/data/rounds';
import { listCaseDocuments } from '@/lib/workflow/case-documents';
import { listCaseSettlements, listStatementFiles } from '@/lib/data/settlements';
import { canTransition } from '@/lib/workflow/transitions';
import { CaseDocumentsPanel } from '@/components/cases/case-documents-panel';
import { RoundsList } from '@/components/mentor/rounds-list';
import { SettlementCard } from '@/components/settlement/settlement-card';
import { CaseEndPanel } from '@/components/settlement/case-end-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const maxDuration = 60;

export default async function Page({ params }: { params: { id: string } }) {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const item = await getCaseById(params.id);
  if (!item || item.program_id !== ctx.programId) notFound();

  const [history, predecessors, rounds, obsFile, docs, settlements, statements] = await Promise.all([
    getCaseStatusHistory(item.id),
    listPredecessorCases(item.id),
    listRounds(item.id),
    getObservationReportFile(item.id),
    listCaseDocuments(item.id, 'institution'),
    listCaseSettlements(item.id),
    listStatementFiles(item.id),
  ]);

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
      >
        <SettlementCard items={settlements} statements={statements} batchHrefBase="/institution/settlements" />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              회차 {rounds.length} / {item.requiredRounds}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RoundsList caseId={item.id} rounds={rounds} editable={false} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">관찰의견서</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {obsFile ? (
              <a href={obsFile.url ?? '#'} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                {obsFile.name}
              </a>
            ) : (
              <p className="text-muted-foreground">아직 제출되지 않았습니다.</p>
            )}
          </CardContent>
        </Card>
        <CaseDocumentsPanel caseId={item.id} docs={docs} viewerRole="institution" canUpload={false} />
        <CaseEndPanel caseId={item.id} pendingWithdrawals={[]} canDecideWithdrawal={false} canForceEnd={false} canWithdrawCase={canTransition('withdraw_case', item.status)} hasActiveMentor={item.mentorId !== null} />
      </CaseDetailShell>
    </main>
  );
}
