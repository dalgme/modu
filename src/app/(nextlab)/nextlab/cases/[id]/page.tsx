import { notFound } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getCaseById, getCaseStatusHistory, listMentorsForProgram, listPredecessorCases } from '@/lib/data/cases';
import { getObservationReportFile, listPendingRequestsForCase, listRounds } from '@/lib/data/rounds';
import { listCaseDocuments, listRequiredDocSlots } from '@/lib/workflow/case-documents';
import { getCaseSurvey } from '@/lib/data/survey';
import { RequiredDocsPanel } from '@/components/cases/required-docs-panel';
import { SurveyResultCard } from '@/components/cases/survey-result-card';
import { MentorChangePanel } from '@/components/nextlab/mentor-change-panel';
import { listCaseSettlements, listStatementFiles } from '@/lib/data/settlements';
import { estimateSettlements } from '@/lib/settlement/settle';
import { ClosureReviewPanel } from '@/components/settlement/closure-review-panel';
import { SettlementCard } from '@/components/settlement/settlement-card';
import { CaseEndPanel } from '@/components/settlement/case-end-panel';
import { canTransition } from '@/lib/workflow/transitions';
import { CaseDetailShell } from '@/components/cases/case-detail-shell';
import { CaseDetailBackNav } from '@/components/cases/case-detail-back-nav';
import { MentorAssignPanel } from '@/components/cases/mentor-assign-panel';
import { MenteeInvitePanel } from '@/components/cases/mentee-invite-panel';
import { CaseDocumentsPanel } from '@/components/cases/case-documents-panel';
import { RoundsList } from '@/components/mentor/rounds-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';

export const maxDuration = 60;

export default async function Page({ params }: { params: { id: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const item = await getCaseById(params.id);
  if (!item || item.program_id !== ctx.programId) notFound();

  const [history, predecessors, mentors, rounds, obsFile, requests, docs, settlements, statements, estimates, slots, survey, changeReqs] = await Promise.all([
    getCaseStatusHistory(item.id),
    listPredecessorCases(item.id),
    listMentorsForProgram(ctx.programId, item.support_type_id),
    listRounds(item.id),
    getObservationReportFile(item.id),
    listPendingRequestsForCase(item.id),
    listCaseDocuments(item.id, 'nextlab'),
    listCaseSettlements(item.id),
    listStatementFiles(item.id),
    estimateSettlements(item.id),
    listRequiredDocSlots(item.id, 'nextlab'),
    getCaseSurvey(item.id),
    createAdminClient().from('mentor_change_requests').select('id, reason, created_at').eq('case_id', item.id).eq('status', 'pending').order('created_at'),
  ]);
  const pendingExt = requests.extensions.filter((r) => r.status === 'pending');
  const pendingWd = requests.withdrawals.filter((r) => r.status === 'pending');
  const SOURCE_LABEL = { mentor_in_group: '그룹 내 멘토별 설정', group: '그룹 일괄 설정', program: '행사 기본' } as const;
  const estimateProps = estimates.map((e) => ({
    mentorName: e.mentorName,
    source: SOURCE_LABEL[e.withholding.source],
    figures: { lines: e.result.lines, gross: e.result.gross, taxable: e.result.taxable, income_tax: e.result.income_tax, local_tax: e.result.local_tax, withholding: e.result.withholding, net: e.result.net, method: e.result.policy.method, exempted: e.result.exempted },
  }));

  return (
    <main className="flex flex-col gap-5">
      <CaseDetailBackNav dashboardHref="/nextlab/dashboard" />
      <CaseDetailShell item={item} history={history} predecessors={predecessors} branding={ctx.branding} basePath="/nextlab/cases" showLoginId>
        <MenteeInvitePanel caseId={item.id} menteeLinked={!!item.mentee_id} defaultName={item.owner_name} defaultPhone={item.phone} defaultEmail={item.email} />
        <MentorAssignPanel
          caseId={item.id}
          mentors={mentors.map((m) => ({ id: m.id, name: m.inGroup ? m.name : `${m.name} (그룹 외)` }))}
          assignable={canTransition('assign_mentor', item.status)}
          currentMentorName={item.mentorName}
          currentMentorId={item.mentorId}
          reassignable={item.mentorId !== null && canTransition('reassign_mentor', item.status)}
        />

        {canTransition('review_approve', item.status) && (
          <ClosureReviewPanel caseId={item.id} estimates={estimateProps} observationUrl={obsFile?.url ?? null} />
        )}

        <SettlementCard items={settlements} statements={statements} canCancel batchHrefBase="/nextlab/settlements/batches" />

        {pendingExt.length > 0 && (
          <Card className="border-amber-300">
            <CardHeader>
              <CardTitle className="text-base">추가 회차 요청 (처리 대기)</CardTitle>
              <p className="text-xs text-muted-foreground">승인·반려는 <a href="/nextlab/requests" className="text-primary underline">요청함</a>에서 처리합니다.</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {pendingExt.map((r) => (
                <p key={r.id}>
                  +{r.extra_rounds}회 · {formatDateTime(r.created_at)} — {r.reason}
                </p>
              ))}
            </CardContent>
          </Card>
        )}

        <MentorChangePanel requests={changeReqs.data ?? []} mentors={mentors.map((m) => ({ id: m.id, name: m.inGroup ? m.name : `${m.name} (그룹 외)` }))} currentMentorId={item.mentorId} />

        <CaseEndPanel
          caseId={item.id}
          pendingWithdrawals={pendingWd.map((r) => ({ id: r.id, reason: r.reason, created_at: r.created_at }))}
          canDecideWithdrawal={canTransition('approve_mentor_withdrawal', item.status)}
          canForceEnd={canTransition('force_end_mentor', item.status)}
          canWithdrawCase={canTransition('withdraw_case', item.status)}
          hasActiveMentor={item.mentorId !== null}
        />

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
        <RequiredDocsPanel caseId={item.id} slots={slots} viewerRole="nextlab" canUpload />
        <CaseDocumentsPanel caseId={item.id} docs={docs} viewerRole="nextlab" canUpload />
      </CaseDetailShell>
    </main>
  );
}
