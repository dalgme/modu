import { requireMentor } from '@/lib/auth/guards';
import { getImpersonation } from '@/lib/auth/impersonation';
import { requireContext } from '@/lib/programs/context';
import { markAssignmentsConfirmed } from '@/lib/matching/auto-match';
import { listMentorCases } from '@/lib/data/cases';
import { loadMentorDashboard } from '@/lib/data/role-dashboard';
import { MentorDashboardV2 } from '@/components/mentor/mentor-dashboard-v2';
import { listMyOpenSurveys } from '@/lib/surveys/campaigns';
import { OpenSurveysCard } from '@/components/surveys/open-surveys-card';
import { getMentorFormsForMentor } from '@/lib/mentor-forms/data';
import { countUnreadMessages } from '@/lib/messages/data';
import Link from 'next/link';

export default async function Page() {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  // P24: 멘토 본인이 로그인해 대시보드(배정 멘티)를 열람하면 매칭 리스트에 '확인' 표시. 대행 중에는 기록하지 않는다.
  if (!(await getImpersonation())) await markAssignmentsConfirmed(profile.id, ctx.programId);
  const [cases, dash] = await Promise.all([
    listMentorCases(profile.id, { programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined }),
    loadMentorDashboard(profile.id, ctx.programId, ctx.supportTypeId ?? null, '/mentor/cases'),
  ]);
  const openSurveys = await listMyOpenSurveys(profile.id, ctx.programId);
  const pendingForms = (await getMentorFormsForMentor(ctx.programId, profile.id)).filter((f) => !f.submittedAt);
  const unreadMessages = await countUnreadMessages(profile.id, ctx.programId);
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
      <MentorDashboardV2 name={profile.name} data={dash} cases={cases} basePath="/mentor/cases" branding={ctx.branding} guideHref="/mentor/guide" scheduleHref="/mentor/schedule" settlementsHref="/mentor/settlements" />
    </main>
  );
}
