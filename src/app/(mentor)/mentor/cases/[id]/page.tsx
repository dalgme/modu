import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getCaseById, getCaseStatusHistory, listMentorCases, listPredecessorCases } from '@/lib/data/cases';
import { menteeLabel } from '@/lib/utils/labels';
import { getObservationReport, getObservationReportFile, getRoundAllowance, listPendingRequestsForCase, listRounds } from '@/lib/data/rounds';
import { listTeamMembers } from '@/lib/data/team-members';
import { listCaseDocuments, listRequiredDocSlots } from '@/lib/workflow/case-documents';
import { RequiredDocsPanel } from '@/components/cases/required-docs-panel';
import { checkClosureReadiness, normalizeObservation } from '@/lib/workflow/closure';
import { resolveRoundReportPolicy } from '@/lib/documents/round-report';
import { createAdminClient } from '@/lib/supabase/admin';
import { MentorCaseNextStep } from '@/components/mentor/mentor-case-next-step';
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
  const [history, predecessors, rounds, allowance, obs, obsFile, requests, docs, online, offline, settlements, statements, estimates, slots, readiness, reportPolicy, lastReview, siblings] = await Promise.all([
    getCaseStatusHistory(item.id),
    // 이전 단계 케이스는 다른 배정이라 RLS 로 못 읽는다 — 요약(그룹·멘토·회차)만 service_role 로 읽어 링크 없이 표시 (P30). 접근 근거 = 이 케이스의 담당 멘토(위 notFound 가드)
    listPredecessorCases(item.id, { admin: true }),
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
    listRequiredDocSlots(item.id, 'mentor'),
    checkClosureReadiness(item.id),
    resolveRoundReportPolicy(item.program_id, item.support_type_id),
    // 보완 요청 사유 — 운영사 검수 기록(reviews) 최신 1건
    createAdminClient().from('reviews').select('result, comment, created_at').eq('case_id', item.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    // 이 멘토의 다른 담당 멘티(같은 행사, 활성 배정) — 이전/다음 이동 (P31)
    listMentorCases(profile.id, { programId: ctx.programId }),
  ]);
  const ordered = siblings.filter((c) => !c.mentorEnded).sort((a, b) => a.owner_name.localeCompare(b.owner_name, 'ko'));
  const idx = ordered.findIndex((c) => c.id === item.id);
  const prevCase = idx > 0 ? ordered[idx - 1]! : null;
  const nextCase = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1]! : null;
  // 직전 회차 — 다음 회차 등록 폼의 방법·시간·장소 기본값 (P31)
  const lastRoundRow = rounds.length > 0 ? rounds[rounds.length - 1]! : null;
  const lastRound = lastRoundRow ? { mode: lastRoundRow.mode === 'online' ? ('online' as const) : ('offline' as const), startedAt: lastRoundRow.started_at, endedAt: lastRoundRow.ended_at, place: lastRoundRow.place } : null;
  const teamMembers = await listTeamMembers(item.id);
  // 참가자 선택지 — 멘티 본인(대표)이 항상 첫 항목. 팀원 명단에 대표 표시가 있으면 함께 노출
  const participantOptions = [
    { key: 'mentee', name: item.owner_name, role: 'representative' as const, subLabel: '멘티' },
    ...teamMembers
      .filter((m) => m.name.trim() !== item.owner_name.trim() || !m.is_representative)
      .map((m) => ({
        key: m.id,
        name: m.name,
        role: m.is_representative ? ('representative' as const) : ('member' as const),
        subLabel: m.member_role ?? undefined,
      })),
  ];
  const myEstimate = estimates[0] ?? null;

  const maxRounds = item.requiredRounds + allowance.approvedExtra;
  const roundsEditable = canTransition('submit_round', item.status);
  const observation = normalizeObservation(obs?.content ?? {});
  const hasObservation = observation.summary.trim().length > 0 || !!obsFile;
  // 버튼 조건 = 서버 게이트(requestClosure)와 같은 함수 (P28) — 보고서 등록 기준 회차·서명/필수서류 정책 포함
  const closureOk = readiness.ok;
  const closureHint = readiness.hint;
  const reported = rounds.filter((r) => r.report_registered_at).length;
  const revisionNote = item.status === 'revision_requested' && lastReview.data?.result === 'revision_requested' ? { comment: lastReview.data.comment, at: lastReview.data.created_at } : null;

  return (
    <main className="flex flex-col gap-5">
      <CaseDetailBackNav dashboardHref="/mentor/dashboard" />
      {ordered.length > 1 && (
        <nav aria-label="담당 멘티 이동" className="flex items-center justify-between gap-2 text-xs">
          {prevCase ? (
            <Link href={`/mentor/cases/${prevCase.id}`} className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 font-medium hover:bg-accent">
              <ChevronLeft className="h-3.5 w-3.5" /> 이전 멘티 · {menteeLabel(prevCase.owner_name, prevCase.business_name)}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">{idx + 1} / {ordered.length}</span>
          {nextCase ? (
            <Link href={`/mentor/cases/${nextCase.id}`} className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 font-medium hover:bg-accent">
              이 멘토의 다음 멘티 · {menteeLabel(nextCase.owner_name, nextCase.business_name)} <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
      <MentorCaseNextStep
        status={item.status}
        reported={reported}
        planned={rounds.length}
        required={item.requiredRounds}
        maxRounds={maxRounds}
        hasObservation={hasObservation}
        closureOk={closureOk}
        closureHint={closureHint}
        revisionNote={revisionNote}
        reportPending={rounds.filter((r) => !r.report_registered_at && new Date(r.started_at).getTime() <= Date.now()).map((r) => r.round_no)}
        nextPlanned={rounds.filter((r) => !r.report_registered_at && new Date(r.started_at).getTime() > Date.now()).map((r) => ({ roundNo: r.round_no, startedAt: r.started_at }))[0] ?? null}
      />
      <CaseDetailShell item={item} history={history} predecessors={predecessors} predecessorLinks={false} branding={ctx.branding} basePath="/mentor/cases">
        <div id="requests" className="scroll-mt-36" />
        <MentorRequests
          caseId={item.id}
          canRequestClosure={closureOk}
          closureHint={closureHint}
          canRequestExtension={roundsEditable}
          pendingExtension={requests.extensions.some((r) => r.status === 'pending')}
          canRequestWithdrawal={canTransition('request_mentor_withdrawal', item.status)}
          pendingWithdrawal={requests.withdrawals.some((r) => r.status === 'pending')}
        />

        <Card id="rounds" className="scroll-mt-36">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-base">
                {ctx.group?.round_label ?? '컨설팅'} 회차 {rounds.length} / {maxRounds}
                {allowance.approvedExtra > 0 && <span className="ml-1 text-xs text-muted-foreground">(추가 {allowance.approvedExtra}회 승인)</span>}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                ① [회차 등록]으로 일정·방법·참가자를 남기고(사전·사후 모두 가능) → ② 진행 후 그 회차의 [보고서 등록]까지 마쳐야 이행으로 인정되어 정산에 포함됩니다. 관찰의견서 제출 후 운영사 검수가 끝나면 정산이 확정됩니다.
              </p>
            </div>
            {roundsEditable && (
              <RoundForm
                caseId={item.id}
                nextRoundNo={rounds.length + 1}
                maxRounds={maxRounds}
                rates={{ online: online?.unitPrice ?? null, offline: offline?.unitPrice ?? null }}
                participantOptions={participantOptions}
                lastRound={lastRound}
              />
            )}
          </CardHeader>
          <CardContent>
            <RoundsList caseId={item.id} rounds={rounds} editable={roundsEditable} signEnabled={reportPolicy.menteeConfirmSignature} />
          </CardContent>
        </Card>

        <Card id="observation" className="scroll-mt-36">
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

        <RequiredDocsPanel caseId={item.id} slots={slots} viewerRole="mentor" canUpload={roundsEditable} />
        <CaseDocumentsPanel caseId={item.id} docs={docs} viewerRole="mentor" canUpload={roundsEditable} />
      </CaseDetailShell>
    </main>
  );
}
