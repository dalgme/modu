import { redirect } from 'next/navigation';

import { getRealSessionProfile, getSessionProfile } from '@/lib/auth/guards';
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

  if (!searchParams.pick && !searchParams.program && !searchParams.denied && !searchParams.error) {
    const target = await autoEnterTarget(real, profile);
    if (target) redirect(`/hub/enter?program=${target}`);
  }

  const programs = await listMyPrograms(profile.id, real.is_platform_admin);
  const selected = searchParams.program ? await getProgram(searchParams.program) : null;
  const groups = selected
    ? await listMyGroups(selected.id, { id: profile.id, role: profile.role, isPlatformAdmin: real.is_platform_admin })
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
            isStaff={profile.role === 'institution' || profile.role === 'nextlab' || real.is_platform_admin}
            tab={searchParams.tab === 'ended' ? 'ended' : 'active'}
          />
        ) : (
          <HubProgramList
            programs={programs}
            tab={searchParams.tab === 'ended' ? 'ended' : 'active'}
            isPlatformAdmin={real.is_platform_admin}
            role={profile.role}
          />
        )}
      </main>
    </div>
  );
}
