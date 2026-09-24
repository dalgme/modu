import { requireMentor } from '@/lib/auth/guards';
import { getImpersonation } from '@/lib/auth/impersonation';
import { requireContext } from '@/lib/programs/context';
import { markAssignmentsConfirmed } from '@/lib/matching/auto-match';
import { listMentorCases, listMentorEndedCases } from '@/lib/data/cases';
import { loadMentorDashboard } from '@/lib/data/role-dashboard';
import { MentorDashboardV2 } from '@/components/mentor/mentor-dashboard-v2';
import { listMyOpenSurveys } from '@/lib/surveys/campaigns';
import { OpenSurveysCard } from '@/components/surveys/open-surveys-card';
import { getMentorFormsForMentor } from '@/lib/mentor-forms/data';
import { countUnreadMessages } from '@/lib/messages/data';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { featureEnabled } from '@/lib/platform/features';
import { MentorOnboarding, type MentorOnboardingItem } from '@/components/mentor/mentor-onboarding';

export default async function Page() {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  // P24: 멘토 본인이 로그인해 대시보드(배정 멘티)를 열람하면 매칭 리스트에 '확인' 표시. 대행 중에는 기록하지 않는다.
  if (!(await getImpersonation())) await markAssignmentsConfirmed(profile.id, ctx.programId);
  // 멘토는 여러 그룹의 멘티를 맡을 수 있으므로 대시보드는 행사 전체 케이스를 보여준다 (P28)
  const [cases, dash, endedCases] = await Promise.all([
    listMentorCases(profile.id, { programId: ctx.programId }),
    loadMentorDashboard(profile.id, ctx.programId, null, '/mentor/cases'),
    listMentorEndedCases(profile.id, ctx.programId),
  ]);
  const openSurveys = await listMyOpenSurveys(profile.id, ctx.programId);
  const pendingForms = (await getMentorFormsForMentor(ctx.programId, profile.id)).filter((f) => !f.submittedAt);
  const unreadMessages = await countUnreadMessages(profile.id, ctx.programId);
  // 시작 전 준비 체크리스트 — 분야(프로필)·서명·(플래그) 지급서류·(플래그) 위촉 서류 (P28)
  const adminDb = createAdminClient();
  const [{ data: mp }, { data: sig }, { data: pdoc }] = await Promise.all([
    adminDb.from('mentor_profiles').select('expertise').eq('program_id', ctx.programId).eq('user_id', profile.id).maybeSingle(),
    adminDb.from('mentor_signatures').select('user_id').eq('user_id', profile.id).maybeSingle(),
    featureEnabled(ctx.program.features, 'mentor_doc_upload') ? adminDb.from('mentor_payment_docs').select('resume_path, bankbook_path, id_card_path').eq('program_id', ctx.programId).eq('user_id', profile.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const onboarding: MentorOnboardingItem[] = [
    { done: (mp?.expertise?.length ?? 0) > 0, label: '내 프로필 · 전문 분야', desc: '분야·권역이 있어야 멘티 매칭 추천에 반영됩니다.', href: '/mentor/profile' },
    { done: !!sig, label: '내 서명 등록', desc: '보고서 자동 서명·현장 서명에 사용합니다.', href: '/mentor/signature' },
    ...(featureEnabled(ctx.program.features, 'mentor_doc_upload')
      ? [{ done: !!(pdoc?.resume_path && pdoc?.bankbook_path && pdoc?.id_card_path), label: '지급서류 업로드', desc: '이력서·통장사본·신분증사본 — 정산 지급에 필요합니다.', href: '/mentor/profile#payment-docs' }]
      : []),
    ...(featureEnabled(ctx.program.features, 'mentor_forms') ? [{ done: pendingForms.length === 0, label: '위촉 서류 제출', desc: '위촉 동의서 등 서식을 제출합니다.', href: '/mentor/forms' }] : []),
  ];
  return (
    <main className="flex flex-col gap-6">
      {unreadMessages > 0 && (
        <Link href="/mentor/qna?tab=messages" className="flex items-center justify-between gap-3 rounded-lg border border-sky-400 bg-sky-50/60 px-4 py-3 text-sm font-semibold text-sky-900 hover:bg-sky-50">
          <span>🔔 멘티가 보낸 새 메시지 {unreadMessages}건</span>
          <span className="underline-offset-4">메시지 확인 →</span>
        </Link>
      )}
      {pendingForms.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <p>
            <b>위촉 서류 {pendingForms.length}건</b>이 미제출 상태입니다: {pendingForms.map((f) => f.title).join(' · ')}
          </p>
          <Link href="/mentor/forms" className="font-semibold text-primary underline">제출하러 가기</Link>
        </div>
      )}
      <OpenSurveysCard surveys={openSurveys} />
      <MentorOnboarding items={onboarding} />
      <MentorDashboardV2 name={profile.name} data={dash} cases={cases} endedCases={endedCases} basePath="/mentor/cases" branding={ctx.branding} guideHref="/mentor/guide" scheduleHref="/mentor/schedule" settlementsHref="/mentor/settlements" />
    </main>
  );
}
