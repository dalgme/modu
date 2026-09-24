import { notFound } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getCaseById, getCaseStatusHistory, listMentorsForProgram, listPredecessorCases, listSuccessorCases } from '@/lib/data/cases';
import { getObservationReportFile, listPendingRequestsForCase, listRounds } from '@/lib/data/rounds';
import { listCaseDocuments, listRequiredDocSlots } from '@/lib/workflow/case-documents';
import { getCaseSurvey } from '@/lib/data/survey';
import { listTeamMembers } from '@/lib/data/team-members';
import { TeamPanel } from '@/components/cases/team-panel';
import { RequiredDocsPanel } from '@/components/cases/required-docs-panel';
import { SurveyResultCard } from '@/components/cases/survey-result-card';
import { MentorChangePanel } from '@/components/nextlab/mentor-change-panel';
import { listLatestRecommendations } from '@/lib/matching/recommend';
import { listTags } from '@/lib/settings/data';
import { MatchRecommendations } from '@/components/matching/match-recommendations';
import { MenteeProfileForm, type TagOptions } from '@/components/matching/profile-forms';
import { listCaseSettlements, listStatementFiles } from '@/lib/data/settlements';
import { estimateSettlements } from '@/lib/settlement/settle';
import { ClosureReviewPanel } from '@/components/settlement/closure-review-panel';
import { SettlementCard } from '@/components/settlement/settlement-card';
import { CaseEndPanel } from '@/components/settlement/case-end-panel';
import { canTransition } from '@/lib/workflow/transitions';
import { CaseDetailShell } from '@/components/cases/case-detail-shell';
import { CaseDetailBackNav } from '@/components/cases/case-detail-back-nav';
import { CaseNextStep } from '@/components/cases/case-next-step';
import { ViewAsStartButton } from '@/components/nextlab/view-as-start-button';
import { MentorAssignPanel } from '@/components/cases/mentor-assign-panel';
import { MenteeInvitePanel } from '@/components/cases/mentee-invite-panel';
import { CaseDocumentsPanel } from '@/components/cases/case-documents-panel';
import { CaseDeletePanel } from '@/components/cases/case-delete-panel';
import { CaseScopeBanner } from '@/components/cases/case-scope-banner';
import { CaseActivityCard, type CaseActivityItem } from '@/components/cases/case-activity-card';
import { RoundsList } from '@/components/mentor/rounds-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';
import { listStaffGroupIds } from '@/lib/programs/data';
import { hasCapability } from '@/lib/auth/capabilities';
import { describeAudit } from '@/lib/audit/describe';
import { CASE_STATUS_META } from '@/types/case-status';
import { fmt } from '@/lib/programs/branding';

export const maxDuration = 60;

export default async function Page({ params }: { params: { id: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const item = await getCaseById(params.id);
  if (!item || item.program_id !== ctx.programId) notFound();

  const [history, predecessors, successors, mentors, rounds, obsFile, requests, docs, settlements, statements, estimates, slots, survey, changeReqs, recs, menteeProfile, tags, myGroupIds, caseAudit] = await Promise.all([
    getCaseStatusHistory(item.id),
    listPredecessorCases(item.id),
    listSuccessorCases(item.id),
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
    listLatestRecommendations(item.id),
    createAdminClient().from('mentee_profiles').select('*').eq('case_id', item.id).maybeSingle(),
    listTags(ctx.programId),
    listStaffGroupIds(ctx.programId, profile.id),
    // [조치 이력] — 이 케이스를 대상으로 한 감사로그(내부 메모 case.memo 포함), 최근 50건
    createAdminClient().from('audit_logs').select('id, actor_id, action, entity_type, entity_id, metadata, created_at').eq('entity_type', 'cases').eq('entity_id', params.id).order('created_at', { ascending: false }).limit(50),
  ]);
  const teamMembers = await listTeamMembers(item.id);
  // 담당 외 그룹 안내: 현재 범위 그룹이 있는데 다르면 'scope', 내 담당 그룹 지정이 있는데 포함되지 않으면 'duty'
  const scopeReason: 'scope' | 'duty' | null = ctx.supportTypeId && ctx.supportTypeId !== item.support_type_id ? 'scope' : myGroupIds.length > 0 && !myGroupIds.includes(item.support_type_id) ? 'duty' : null;
  // 조치 이력 = 상태 이력 + 감사로그(메모 포함) 시각 역순 병합, 최근 50건
  const actorIds = Array.from(new Set([...history.map((h) => h.changed_by), ...(caseAudit.data ?? []).map((a) => a.actor_id)].filter((x): x is string => !!x)));
  const { data: actorRows } = actorIds.length ? await createAdminClient().from('users').select('id, name').in('id', actorIds) : { data: [] as { id: string; name: string }[] };
  const actorName = new Map((actorRows ?? []).map((u) => [u.id, u.name]));
  const statusLabel = (st: string) => fmt(CASE_STATUS_META[st as keyof typeof CASE_STATUS_META]?.label ?? st, ctx.branding);
  const activity: CaseActivityItem[] = [
    ...history.map((h) => ({
      id: `h-${h.id}`,
      at: h.created_at,
      kind: 'status' as const,
      actorName: h.changed_by ? (actorName.get(h.changed_by) ?? null) : null,
      category: '상태',
      text: `${h.from_status ? `${statusLabel(h.from_status)} → ` : ''}${statusLabel(h.to_status)}${h.note ? ` — ${h.note}` : ''}`,
    })),
    ...(caseAudit.data ?? []).map((a) => {
      const d = describeAudit({ action: a.action, entity_type: a.entity_type, entity_id: a.entity_id, metadata: a.metadata, actorName: a.actor_id ? (actorName.get(a.actor_id) ?? null) : null });
      return { id: `a-${a.id}`, at: a.created_at, kind: a.action === 'case.memo' ? ('memo' as const) : ('audit' as const), actorName: a.actor_id ? (actorName.get(a.actor_id) ?? null) : null, category: d.category, text: d.text };
    }),
  ]
    .sort((x, y) => (x.at < y.at ? 1 : -1))
    .slice(0, 50);
  const tagOptions: TagOptions = {};
  for (const t of tags) (tagOptions[t.category] ??= []).push(t.label);
  const mp = menteeProfile.data;
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
      {scopeReason && <CaseScopeBanner groupName={item.supportTypeName} reason={scopeReason} />}
      <CaseNextStep
        status={item.status}
        mentorName={item.mentorName}
        roundsReported={rounds.filter((r) => r.report_registered_at).length}
        roundsPlanned={rounds.length}
        requiredRounds={item.requiredRounds}
        pendingRequests={pendingExt.length + pendingWd.length}
        pendingChangeRequests={(changeReqs.data ?? []).length}
        menteeLinked={!!item.mentee_id}
      />
      {/* 종결 요청 상태에서는 검수 패널을 "지금 할 일" 바로 아래에 — 스크롤 없이 승인/보완 (2026-09-24) */}
      {item.status === 'closure_requested' && canTransition('review_approve', item.status) && (
        <div id="review" className="scroll-mt-40">
          <ClosureReviewPanel caseId={item.id} estimates={estimateProps} observationUrl={obsFile?.url ?? null} />
        </div>
      )}
      <CaseDetailShell item={item} history={history} predecessors={predecessors} successors={successors} branding={ctx.branding} basePath="/nextlab/cases" showLoginId>
        <div id="invite" className="scroll-mt-40" />
        <MenteeInvitePanel caseId={item.id} menteeLinked={!!item.mentee_id} defaultName={item.owner_name} defaultPhone={item.phone} defaultEmail={item.email} />
        <div id="assign" className="scroll-mt-40" />
        <MentorAssignPanel
          caseId={item.id}
          mentors={mentors.map((m) => ({ id: m.id, name: m.inGroup ? m.name : `${m.name} (그룹 외)` }))}
          assignable={canTransition('assign_mentor', item.status)}
          currentMentorName={item.mentorName}
          currentMentorId={item.mentorId}
          reassignable={item.mentorId !== null && canTransition('reassign_mentor', item.status)}
          recallable={item.mentorId !== null && canTransition('recall_mentor', item.status)}
          forceEndable={item.mentorId !== null && canTransition('force_end_mentor', item.status)}
        />

        {(canTransition('assign_mentor', item.status) || canTransition('reassign_mentor', item.status)) && (
          <MatchRecommendations caseId={item.id} initial={recs} assignable={canTransition('assign_mentor', item.status)} reassignable={item.mentorId !== null && canTransition('reassign_mentor', item.status)} currentMentorId={item.mentorId} modelConfigured={!!process.env.ANTHROPIC_API_KEY} />
        )}
        <div id="profile" className="scroll-mt-40" />
        <MenteeProfileForm caseId={item.id} value={mp ? { industry: mp.industry, stage: mp.stage, region: mp.region, preferred_mode: mp.preferred_mode, needs: mp.needs, keywords: mp.keywords, summary: mp.summary, nickname: mp.nickname, external_no: mp.external_no, mentee_type: mp.mentee_type, preferred_mentor: mp.preferred_mentor, note: mp.note } : null} tags={tagOptions} />

        <div id="team" className="scroll-mt-40" />
        <TeamPanel
          caseId={item.id}
          item={item.item}
          itemDescription={mp?.item_description ?? null}
          members={teamMembers.map((m) => ({ id: m.id, name: m.name, member_role: m.member_role, phone: m.phone, email: m.email, is_representative: m.is_representative }))}
        />

        {item.status !== 'closure_requested' && canTransition('review_approve', item.status) && (
          <div id="review" className="scroll-mt-40">
            <ClosureReviewPanel caseId={item.id} estimates={estimateProps} observationUrl={obsFile?.url ?? null} />
          </div>
        )}

        <div id="settlement" className="scroll-mt-40" />
        <SettlementCard items={settlements} statements={statements} canCancel batchHrefBase="/nextlab/settlements/batches" />

        {pendingExt.length > 0 && (
          <Card className="border-amber-300">
            <CardHeader>
              <CardTitle className="text-base">추가 회차 요청 (처리 대기)</CardTitle>
              <p className="text-xs text-muted-foreground">승인·반려는 <a href="/nextlab/board?tab=requests" className="text-primary underline">게시판 › 처리 대기 요청</a>에서 처리합니다.</p>
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

        <div id="change" className="scroll-mt-40" />
        <MentorChangePanel requests={changeReqs.data ?? []} mentors={mentors.map((m) => ({ id: m.id, name: m.inGroup ? m.name : `${m.name} (그룹 외)` }))} currentMentorId={item.mentorId} />

        <CaseEndPanel
          caseId={item.id}
          pendingWithdrawals={pendingWd.map((r) => ({ id: r.id, reason: r.reason, created_at: r.created_at }))}
          canDecideWithdrawal={canTransition('approve_mentor_withdrawal', item.status)}
          canForceEnd={canTransition('force_end_mentor', item.status)}
          canWithdrawCase={canTransition('withdraw_case', item.status)}
          hasActiveMentor={item.mentorId !== null}
          canReinstate={canTransition('reinstate_case', item.status) && (!ctx.grade || ctx.grade === 'pl')}
          withdrawnReason={item.withdrawn_reason ?? null}
        />

        <Card id="rounds" className="scroll-mt-40">
          <CardHeader>
            <CardTitle className="text-base">
              회차 {rounds.length} / {item.requiredRounds}
              <span className="ml-2 text-xs font-normal text-muted-foreground">보고서 등록 {rounds.filter((r) => r.report_registered_at).length}회차</span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>회차 등록·보고서·관찰의견서는 담당 멘토가 합니다. 멘토를 대신해 처리해야 하면 대행 로그인으로 그 화면에서 등록하세요.</span>
              {item.mentorId && item.mentorName && <ViewAsStartButton targetUserId={item.mentorId} targetName={item.mentorName} size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" />}
            </div>
          </CardHeader>
          <CardContent>
            <RoundsList caseId={item.id} rounds={rounds} editable={false} operatorCorrect={hasCapability(ctx, 'case.manage')} />
          </CardContent>
        </Card>

        <Card id="observation" className="scroll-mt-40">
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
        <CaseActivityCard caseId={item.id} items={activity} canMemo={hasCapability(ctx, 'case.manage')} />
        <div id="docs" className="scroll-mt-40" />
        <a
          href={`/api/staff/case-docs-zip?case=${item.id}`}
          className="flex items-center justify-between rounded-lg border bg-background px-4 py-2.5 text-sm font-semibold hover:bg-accent"
          title="회차 보고서·사진·관찰의견서·정산서·필수서류를 종류별 폴더로 정리한 ZIP"
        >
          <span>📦 이 케이스 서류 일괄 다운로드 (ZIP) — 정산 증빙 제출용</span>
          <span>↓</span>
        </a>
        <RequiredDocsPanel caseId={item.id} slots={slots} viewerRole="nextlab" canUpload />
        <CaseDocumentsPanel caseId={item.id} docs={docs} viewerRole="nextlab" canUpload />
        {hasCapability(ctx, 'case.delete') && <CaseDeletePanel caseId={item.id} ownerName={item.owner_name} businessName={item.business_name} />}
      </CaseDetailShell>
    </main>
  );
}
