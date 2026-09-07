import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMentorCases } from '@/lib/data/cases';
import { MentorDashboardBody } from '@/components/mentor/mentor-dashboard-body';

export default async function Page() {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  const cases = await listMentorCases(profile.id, { programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined });
  return (
    <main className="flex flex-col gap-6">
      <MentorDashboardBody name={profile.name} cases={cases} basePath="/mentor/cases" branding={ctx.branding} />
    </main>
  );
}
