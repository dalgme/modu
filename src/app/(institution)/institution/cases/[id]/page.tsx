import { notFound } from 'next/navigation';

import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getCaseById, getCaseStatusHistory, listPredecessorCases } from '@/lib/data/cases';
import { CaseDetailShell } from '@/components/cases/case-detail-shell';
import { CaseDetailBackNav } from '@/components/cases/case-detail-back-nav';
import { OperatorRequestButton } from '@/components/cases/operator-request-button';
import { getObservationReportFile, listRounds } from '@/lib/data/rounds';
import { listCaseDocuments, listRequiredDocSlots } from '@/lib/workflow/case-documents';
import { getCaseSurvey } from '@/lib/data/survey';
import { RequiredDocsPanel } from '@/components/cases/required-docs-panel';
import { SurveyResultCard } from '@/components/cases/survey-result-card';
import { listCaseSettlements, listStatementFiles } from '@/lib/data/settlements';
import { canWithdrawAs } from '@/lib/workflow/transitions';
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

  const [history, predecessors, rounds, obsFile, docs, settlements, statements, slots, survey] = await Promise.all([
    getCaseStatusHistory(item.id),
    listPredecessorCases(item.id),
    listRounds(item.id),
    getObservationReportFile(item.id),
    listCaseDocuments(item.id, 'institution'),
    listCaseSettlements(item.id),
    listStatementFiles(item.id),
    listRequiredDocSlots(item.id, 'institution'),
    getCaseSurvey(item.id),
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
        <SurveyResultCard survey={survey} />
        <a
          href={`/api/staff/case-docs-zip?case=${item.id}`}
          className="flex items-center justify-between rounded-lg border bg-background px-4 py-2.5 text-sm font-semibold hover:bg-accent"
          title="회차 보고서·사진·관찰의견서·정산서·필수서류를 종류별 폴더로 정리한 ZIP"
        >
          <span>📦 이 케이스 서류 일괄 다운로드 (ZIP)</span>
          <span>↓</span>
        </a>
        <RequiredDocsPanel caseId={item.id} slots={slots} viewerRole="institution" canUpload={false} />
        <CaseDocumentsPanel caseId={item.id} docs={docs} viewerRole="institution" canUpload={false} />
        {/* (P31) 발주처 중도 종료는 운영사 검수 중(종결·보완 요청)에는 불가 — 서버 액션(withdrawCaseAction)과 같은 canWithdrawAs */}
        <CaseEndPanel caseId={item.id} pendingWithdrawals={[]} canDecideWithdrawal={false} canForceEnd={false} canWithdrawCase={canWithdrawAs('institution', item.status)} hasActiveMentor={item.mentorId !== null} />
      </CaseDetailShell>
    </main>
  );
}
