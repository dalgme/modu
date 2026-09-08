import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMentorCases } from '@/lib/data/cases';
import { MentorDashboardBody } from '@/components/mentor/mentor-dashboard-body';
import { listMyOpenSurveys } from '@/lib/surveys/campaigns';
import { OpenSurveysCard } from '@/components/surveys/open-surveys-card';

export default async function Page() {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  const cases = await listMentorCases(profile.id, { programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined });
  const openSurveys = await listMyOpenSurveys(profile.id, ctx.programId);
  return (
    <main className="flex flex-col gap-6">
      <OpenSurveysCard surveys={openSurveys} />
      <MentorDashboardBody name={profile.name} cases={cases} basePath="/mentor/cases" branding={ctx.branding} />
    </main>
  );
}
