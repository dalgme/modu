import { requireMentee } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMenteeCases } from '@/lib/data/cases';
import { MenteeDashboardBody } from '@/components/mentee/mentee-dashboard-body';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profile = await requireMentee();
  const ctx = await requireContext(profile);
  // 그룹 컨텍스트가 있으면 그 그룹 케이스를 먼저, 나머지 행사 내 케이스는 이력으로
  const all = await listMenteeCases(profile.id, { programId: ctx.programId });
  const cases = ctx.supportTypeId
    ? [...all.filter((c) => c.support_type_id === ctx.supportTypeId), ...all.filter((c) => c.support_type_id !== ctx.supportTypeId)]
    : all;
  return (
    <main className="flex flex-col gap-5">
      <MenteeDashboardBody name={profile.name} cases={cases} branding={ctx.branding} />
    </main>
  );
}
