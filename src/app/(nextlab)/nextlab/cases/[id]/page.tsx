import { notFound } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getCaseById, getCaseStatusHistory, listMentorsForProgram, listPredecessorCases } from '@/lib/data/cases';
import { getObservationReportFile, listPendingRequestsForCase, listRounds } from '@/lib/data/rounds';
import { listCaseDocuments } from '@/lib/workflow/case-documents';
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

  const [history, predecessors, mentors, rounds, obsFile, requests, docs] = await Promise.all([
    getCaseStatusHistory(item.id),
    listPredecessorCases(item.id),
    listMentorsForProgram(ctx.programId, item.support_type_id),
    listRounds(item.id),
    getObservationReportFile(item.id),
    listPendingRequestsForCase(item.id),
    listCaseDocuments(item.id, 'nextlab'),
  ]);
  const pendingExt = requests.extensions.filter((r) => r.status === 'pending');
  const pendingWd = requests.withdrawals.filter((r) => r.status === 'pending');

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

        {(pendingExt.length > 0 || pendingWd.length > 0) && (
          <Card className="border-amber-300">
            <CardHeader>
              <CardTitle className="text-base">처리 대기 요청</CardTitle>
              <p className="text-xs text-muted-foreground">승인·반려 처리는 다음 단계(P6 요청함)에서 열립니다.</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {pendingExt.map((r) => (
                <p key={r.id}>
                  <b>추가 회차 요청</b> +{r.extra_rounds}회 · {formatDateTime(r.created_at)} — {r.reason}
                </p>
              ))}
              {pendingWd.map((r) => (
                <p key={r.id} className="text-destructive">
                  <b>멘토 중도 종료 요청</b> · {formatDateTime(r.created_at)} — {r.reason}
                </p>
              ))}
            </CardContent>
          </Card>
        )}

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
            {item.status === 'closure_requested' && (
              <p className="mt-2 text-xs text-muted-foreground">검수 승인·보완 요청·정산 확정은 다음 단계(P4)에서 열립니다.</p>
            )}
          </CardContent>
        </Card>

        <CaseDocumentsPanel caseId={item.id} docs={docs} viewerRole="nextlab" canUpload />
      </CaseDetailShell>
    </main>
  );
}
