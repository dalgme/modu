import 'server-only';

import type { Profile } from '@/lib/auth/guards';
import { roleHome } from '@/lib/auth/roles';
import { getProgram, getSupportType, isProgramMember, listMyGroups, listMyPrograms } from '@/lib/programs/data';
import { writeContextCookie } from '@/lib/programs/context';

export type EnterResult = { ok: true; redirectTo: string } | { ok: false; redirectTo: string };

/**
 * 행사(+그룹) 진입 — docs/MODU-DESIGN.md §18-2.
 * 그룹을 지정하지 않았고 들어갈 수 있는 그룹이 정확히 1개면 그 그룹까지 자동 진입.
 * 쿠키를 쓰므로 라우트 핸들러/서버 액션에서만 호출한다.
 */
export async function enterProgram(
  real: Profile,
  effective: Profile,
  programId: string,
  supportTypeId: string | null,
  explicitAll: boolean,
): Promise<EnterResult> {
  const isAdmin = real.is_platform_admin;
  const program = await getProgram(programId);
  if (!program) return { ok: false, redirectTo: '/hub?denied=1' };
  if (!(await isProgramMember(effective.id, programId, isAdmin))) return { ok: false, redirectTo: '/hub?denied=1' };

  let groupId = supportTypeId;
  if (groupId) {
    const g = await getSupportType(groupId);
    if (!g || g.program_id !== programId) return { ok: false, redirectTo: '/hub?denied=1' };
  } else if (!explicitAll) {
    const groups = await listMyGroups(programId, { id: effective.id, role: effective.role, isPlatformAdmin: isAdmin });
    if (groups.length === 1) groupId = groups[0]!.group.id;
    else if (groups.length > 1 && !isStaff(effective)) return { ok: false, redirectTo: `/hub?program=${programId}` };
  }

  if (!writeContextCookie(effective.id, programId, groupId)) return { ok: false, redirectTo: '/hub?error=cookie' };
  return { ok: true, redirectTo: roleHome(effective.role) };
}

/** 로그인 직후 자동 진입 대상 (활성 행사 1개) — 없으면 null */
export async function autoEnterTarget(real: Profile, effective: Profile): Promise<string | null> {
  const programs = await listMyPrograms(effective.id, real.is_platform_admin);
  const active = programs.filter((p) => p.program.status === 'active' && p.memberActive);
  if (active.length !== 1) return null;
  return active[0]!.program.id;
}

function isStaff(p: Profile): boolean {
  return p.role === 'institution' || p.role === 'nextlab' || p.is_platform_admin;
}
