import { notFound } from 'next/navigation';

import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getCaseById, getCaseStatusHistory, listPredecessorCases } from '@/lib/data/cases';
import { getObservationReport, getObservationReportFile, getRoundAllowance, listPendingRequestsForCase, listRounds } from '@/lib/data/rounds';
import { listCaseDocuments } from '@/lib/workflow/case-documents';
import { normalizeObservation } from '@/lib/workflow/closure';
import { resolveRate, kstDate } from '@/lib/settlement/rates';
import { canTransition } from '@/lib/workflow/transitions';
import { CaseDetailShell } from '@/components/cases/case-detail-shell';
import { CaseDetailBackNav } from '@/components/cases/case-detail-back-nav';
import { CaseDocumentsPanel } from '@/components/cases/case-documents-panel';
import { RoundForm } from '@/components/mentor/round-form';
import { RoundsList } from '@/components/mentor/rounds-list';
import { ObservationForm } from '@/components/mentor/observation-form';
import { MentorRequests } from '@/components/mentor/mentor-requests';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listCaseSettlements, listStatementFiles } from '@/lib/data/settlements';
import { estimateSettlements } from '@/lib/settlement/settle';
import { SettlementCard } from '@/components/settlement/settlement-card';
import { SettlementSummary } from '@/components/settlement/settlement-summary';

export const maxDuration = 60;

export default async function Page({ params }: { params: { id: string } }) {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  const item = await getCaseById(params.id);
  if (!item || item.program_id !== ctx.programId || item.mentorId !== profile.id) notFound();

  const today = kstDate(new Date());
  const [history, predecessors, rounds, allowance, obs, obsFile, requests, docs, online, offline, settlements, statements, estimates] = await Promise.all([
    getCaseStatusHistory(item.id),
    listPredecessorCases(item.id),
    listRounds(item.id),
    getRoundAllowance(item.id),
    getObservationReport(item.id),
    getObservationReportFile(item.id),
    listPendingRequestsForCase(item.id),
    listCaseDocuments(item.id, 'mentor'),
    resolveRate(item.program_id, item.support_type_id, 'online', today),
    resolveRate(item.program_id, item.support_type_id, 'offline', today),
    listCaseSettlements(item.id),
    listStatementFiles(item.id),
    estimateSettlements(item.id, profile.id),
  ]);
  const myEstimate = estimates[0] ?? null;

  const maxRounds = item.requiredRounds + allowance.approvedExtra;
  const roundsEditable = canTransition('submit_round', item.status);
  const observation = normalizeObservation(obs?.content ?? {});
  const hasObservation = observation.summary.trim().length > 0 || !!obsFile;
  const closureOk = canTransition('request_closure', item.status) && rounds.length >= item.requiredRounds && hasObservation;
  const closureHint = !canTransition('request_closure', item.status)
    ? '컨설팅 진행 중(또는 보완 요청) 단계에서만 종결을 요청할 수 있습니다.'
    : rounds.length < item.requiredRounds
      ? `필수 회차 ${item.requiredRounds}회 중 ${rounds.length}회 등록됨 — 회차를 모두 등록하세요.`
      : !hasObservation
        ? '관찰의견서 총평을 작성(임시 저장)하거나 완성본을 올리면 종결을 요청할 수 있습니다.'
        : '관찰의견서를 제출하고 종결을 요청합니다.';

  return (
    <main className="flex flex-col gap-5">
      <CaseDetailBackNav dashboardHref="/mentor/dashboard" />
      <CaseDetailShell item={item} history={history} predecessors={predecessors} branding={ctx.branding} basePath="/mentor/cases">
        <MentorRequests
          caseId={item.id}
          canRequestClosure={closureOk}
          closureHint={closureHint}
          canRequestExtension={roundsEditable}
          pendingExtension={requests.extensions.some((r) => r.status === 'pending')}
          canRequestWithdrawal={canTransition('request_mentor_withdrawal', item.status)}
          pendingWithdrawal={requests.withdrawals.some((r) => r.status === 'pending')}
        />

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-base">
                {ctx.group?.round_label ?? '컨설팅'} 회차 {rounds.length} / {maxRounds}
                {allowance.approvedExtra > 0 && <span className="ml-1 text-xs text-muted-foreground">(추가 {allowance.approvedExtra}회 승인)</span>}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                회차 등록 = 이행(예상 정산). 관찰의견서 제출 후 운영사 검수가 끝나면 완료(정산 확정)로 바뀝니다.
              </p>
            </div>
            {roundsEditable && (
              <RoundForm
                caseId={item.id}
                nextRoundNo={rounds.length + 1}
                maxRounds={maxRounds}
                rates={{ online: online?.unitPrice ?? null, offline: offline?.unitPrice ?? null }}
              />
            )}
          </CardHeader>
          <CardContent>
            <RoundsList caseId={item.id} rounds={rounds} editable={roundsEditable} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">관찰의견서 (멘티당 1건)</CardTitle>
            <p className="text-xs text-muted-foreground">컨설팅을 마무리하며 작성합니다. 종결 요청 시 PDF 로 확정되어 운영사에 제출됩니다.</p>
          </CardHeader>
          <CardContent>
            <ObservationForm caseId={item.id} initial={observation} file={obsFile} editable={roundsEditable} />
          </CardContent>
        </Card>

        {myEstimate && myEstimate.rounds.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">예상 정산액 (미확정)</CardTitle>
              <p className="text-xs text-muted-foreground">등록한 회차 기준 예상액입니다. 운영사 검수 승인 시 같은 계산으로 확정됩니다.</p>
            </CardHeader>
            <CardContent>
              <SettlementSummary
                compact
                f={{ lines: myEstimate.result.lines, gross: myEstimate.result.gross, taxable: myEstimate.result.taxable, income_tax: myEstimate.result.income_tax, local_tax: myEstimate.result.local_tax, withholding: myEstimate.result.withholding, net: myEstimate.result.net, method: myEstimate.result.policy.method, exempted: myEstimate.result.exempted }}
              />
            </CardContent>
          </Card>
        )}
        <SettlementCard items={settlements.filter((s) => s.mentor_id === profile.id)} statements={statements} title="내 확정 정산" />

        <CaseDocumentsPanel caseId={item.id} docs={docs} viewerRole="mentor" canUpload={roundsEditable} />
      </CaseDetailShell>
    </main>
  );
}
