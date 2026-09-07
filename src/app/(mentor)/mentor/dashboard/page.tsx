import { requireMentor } from '@/lib/auth/guards';
import { listMentorCases } from '@/lib/data/cases';
import { MentorDashboardBody } from '@/components/mentor/mentor-dashboard-body';

export default async function Page() {
  const profile = await requireMentor();
  const cases = await listMentorCases(profile.id);

  return (
    <main className="flex flex-col gap-6">
      <MentorDashboardBody name={profile.name} cases={cases} basePath="/mentor/cases" />
    </main>
  );
}
