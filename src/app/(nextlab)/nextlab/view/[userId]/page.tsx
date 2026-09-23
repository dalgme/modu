import { notFound } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getMemberById } from '@/lib/data/members';
import { membershipRole } from '@/lib/auth/program-role';
import { listCases, listMentorCases, listMenteeCases } from '@/lib/data/cases';
import { ViewAsShell, VIEW_AS_TABS } from '@/components/nextlab/view-as-shell';
import { MentorDashboardV2 } from '@/components/mentor/mentor-dashboard-v2';
import { loadMentorDashboard, loadMenteeDashboardExtra } from '@/lib/data/role-dashboard';
import { MenteeDashboardBody } from '@/components/mentee/mentee-dashboard-body';
import { InstitutionDashboardBody } from '@/components/institution/institution-dashboard-body';

/** 회원 화면 열람 (view-as) — 대상 회원이 보는 대시보드를 운영사가 그대로 본다 */
export default async function Page({ params, searchParams }: { params: { userId: string }; searchParams: { tab?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const target = await getMemberById(params.userId);
  if (!target) notFound();
  // 이 행사 안에서의 역할로 화면을 고른다 (설계 B)
  target.role = (await membershipRole(target.id, ctx.programId)) ?? target.role;

  const tabs = VIEW_AS_TABS[target.role];
  const activeTab = tabs.find((t) => t.key === searchParams.tab)?.key ?? tabs[0]!.key;
  const scope = { programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined };

  let body: React.ReactNode;
  if (target.role === 'mentor') {
    const [cases, dash] = await Promise.all([listMentorCases(target.id, scope), loadMentorDashboard(target.id, ctx.programId, ctx.supportTypeId ?? null, '/nextlab/cases')]);
    body = <MentorDashboardV2 name={target.name} data={dash} cases={cases} basePath="/nextlab/cases" branding={ctx.branding} guideHref={`/nextlab/view/${target.id}`} scheduleHref={`/nextlab/view/${target.id}`} settlementsHref={`/nextlab/view/${target.id}`} />;
  } else if (target.role === 'mentee') {
    const cases = await listMenteeCases(target.id, { programId: ctx.programId });
    const extra = await loadMenteeDashboardExtra(cases[0] ?? null, ctx.programId);
    body = <MenteeDashboardBody name={target.name} cases={cases} branding={ctx.branding} extra={extra} />;
  } else {
    const cases = await listCases(scope);
    body = <InstitutionDashboardBody cases={cases} basePath="/nextlab/cases" branding={ctx.branding} groupName={ctx.group?.name ?? null} />;
  }

  return (
    <main className="flex flex-col gap-5">
      <ViewAsShell target={target} activeTab={activeTab} />
      {body}
    </main>
  );
}
