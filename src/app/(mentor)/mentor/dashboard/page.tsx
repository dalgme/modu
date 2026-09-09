import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMentorCases } from '@/lib/data/cases';
import { MentorDashboardBody } from '@/components/mentor/mentor-dashboard-body';
import { listMyOpenSurveys } from '@/lib/surveys/campaigns';
import { OpenSurveysCard } from '@/components/surveys/open-surveys-card';
import { getMentorFormsForMentor } from '@/lib/mentor-forms/data';
import Link from 'next/link';

export default async function Page() {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  const cases = await listMentorCases(profile.id, { programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined });
  const openSurveys = await listMyOpenSurveys(profile.id, ctx.programId);
  const pendingForms = (await getMentorFormsForMentor(ctx.programId, profile.id)).filter((f) => !f.submittedAt);
  return (
    <main className="flex flex-col gap-6">
      {pendingForms.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <p>
            <b>위촉 서류 {pendingForms.length}건</b>이 미제출 상태입니다: {pendingForms.map((f) => f.title).join(' · ')}
          </p>
          <Link href="/mentor/forms" className="font-semibold text-primary underline">제출하러 가기</Link>
        </div>
      )}
      <OpenSurveysCard surveys={openSurveys} />
      <MentorDashboardBody name={profile.name} cases={cases} basePath="/mentor/cases" branding={ctx.branding} />
    </main>
  );
}
