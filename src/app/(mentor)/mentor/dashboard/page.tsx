import { requireMentor } from '@/lib/auth/guards';
import { getImpersonation } from '@/lib/auth/impersonation';
import { requireContext } from '@/lib/programs/context';
import { markAssignmentsConfirmed } from '@/lib/matching/auto-match';
import { listMentorCases, listMentorEndedCases } from '@/lib/data/cases';
import { loadMentorDashboard } from '@/lib/data/role-dashboard';
import { MentorDashboardV2 } from '@/components/mentor/mentor-dashboard-v2';
import { listMyOpenSurveys } from '@/lib/surveys/campaigns';
import { OpenSurveysCard } from '@/components/surveys/open-surveys-card';
import { getMentorDocStatusForMentor } from '@/lib/mentor-docs/data';
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
  // (P32) 운영사가 오프라인 수령을 체크하는 서류 — 멘토는 열람만 (유효 체크리스트가 꺼져 있으면 null)
  const docStatus = await getMentorDocStatusForMentor(ctx.programId, profile.id);
  const unreadMessages = await countUnreadMessages(profile.id, ctx.programId);
  // 시작 전 준비 체크리스트 — 분야(프로필)·서명·(플래그) 지급서류·제출 서류 수령 확인 (P28·P32)
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
    ...(docStatus
      ? [{
          done: docStatus.receivedCount === docStatus.total,
          label: `제출 서류 수령 확인 ${docStatus.receivedCount}/${docStatus.total}`,
          desc: docStatus.receivedCount === docStatus.total
            ? '운영사가 모든 서류의 수령을 확인했습니다.'
            : `미수령: ${docStatus.items.filter((i) => !i.received).map((i) => i.name).join(', ')} — 운영사에 제출해 주세요. 수령 확인은 운영사가 체크합니다.`,
          href: null,
        }]
      : []),
  ];
  return (
    <main className="flex flex-col gap-6">
      {unreadMessages > 0 && (
        <Link href="/mentor/qna?tab=messages" className="flex items-center justify-between gap-3 rounded-lg border border-sky-400 bg-sky-50/60 px-4 py-3 text-sm font-semibold text-sky-900 hover:bg-sky-50">
          <span>🔔 멘티가 보낸 새 메시지 {unreadMessages}건</span>
          <span className="underline-offset-4">메시지 확인 →</span>
        </Link>
      )}
      <OpenSurveysCard surveys={openSurveys} />
      <MentorOnboarding items={onboarding} />
      <MentorDashboardV2 name={profile.name} data={dash} cases={cases} endedCases={endedCases} basePath="/mentor/cases" branding={ctx.branding} guideHref="/mentor/guide" scheduleHref="/mentor/schedule" settlementsHref="/mentor/settlements" />
    </main>
  );
}
