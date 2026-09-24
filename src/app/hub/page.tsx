import { redirect } from 'next/navigation';

import { getRealSessionProfile, getSessionProfile } from '@/lib/auth/guards';
import { getImpersonation } from '@/lib/auth/impersonation';
import { listMyGroups, listMyPrograms, getProgram } from '@/lib/programs/data';
import { autoEnterTarget } from '@/lib/programs/enter';
import { PLATFORM_BRANDING } from '@/lib/programs/branding';
import { AppHeader } from '@/components/common/app-header';
import { HubProgramList } from '@/components/hub/hub-program-list';
import { HubGroupList } from '@/components/hub/hub-group-list';

export const dynamic = 'force-dynamic';

/**
 * 허브 — 활성 행사 배너 / 종료 행사 탭 / 행사 안 그룹 배너 (docs/MODU-DESIGN.md §18-2).
 * 활성 행사가 1개면 자동 진입한다(`?pick=1` 이면 건너뛰고 목록을 보여준다).
 */
export default async function HubPage({
  searchParams,
}: {
  searchParams: { pick?: string; program?: string; tab?: string; denied?: string; error?: string };
}) {
  const real = await getRealSessionProfile();
  if (!real || !real.is_active) redirect('/login');
  if (real.must_change_password) redirect('/change-password');
  const profile = (await getSessionProfile()) ?? real;

  // 플랫폼 관리자는 통합관리 전용 계정 — 행사 소속·진입 없이 항상 콘솔로 간다.
  // 단, 대행 중에는 대상 명의로 허브를 지나 대상의 행사로 진입한다 (P19).
  const imp = await getImpersonation();
  const isAdmin = real.is_platform_admin && !imp;
  if (isAdmin) redirect('/platform');
  // 운영사 대행은 발급된 행사에 묶인다 — 허브에서 다른 행사를 고를 수 없고, 바로 그 행사로 진입한다 (P31)
  if (imp?.programId && !searchParams.denied && !searchParams.error) {
    redirect(`/hub/enter?program=${imp.programId}`);
  }
  if (!searchParams.pick && !searchParams.program && !searchParams.denied && !searchParams.error) {
    const target = await autoEnterTarget(real, profile);
    if (target) redirect(`/hub/enter?program=${target}`);
  }

  const programsAll = await listMyPrograms(profile.id, isAdmin, profile.role);
  const programs = imp?.programId ? programsAll.filter((p) => p.program.id === imp.programId) : programsAll;
  const selected = searchParams.program ? await getProgram(searchParams.program) : null;
  const groups = selected
    ? await listMyGroups(selected.id, { id: profile.id, role: profile.role, isPlatformAdmin: isAdmin })
    : [];

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader name={profile.name} role={profile.role} branding={PLATFORM_BRANDING} />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        {searchParams.denied && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            선택한 행사 또는 그룹에 접근 권한이 없습니다.
          </p>
        )}
        {searchParams.error === 'cookie' && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            서버 설정 오류로 행사를 선택할 수 없습니다. 관리자에게 문의하세요.
          </p>
        )}
        {selected ? (
          <HubGroupList
            program={selected}
            groups={groups}
            isStaff={profile.role === 'institution' || profile.role === 'nextlab' || isAdmin}
            tab={searchParams.tab === 'ended' ? 'ended' : 'active'}
          />
        ) : (
          <HubProgramList
            programs={programs}
            tab={searchParams.tab === 'ended' ? 'ended' : 'active'}
            isPlatformAdmin={isAdmin}
            role={profile.role}
          />
        )}
      </main>
    </div>
  );
}
