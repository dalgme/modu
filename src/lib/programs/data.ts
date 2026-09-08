import 'server-only';

import { cache } from 'react';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@/types/database';
import type { UserRole } from '@/lib/auth/roles';
import { brandingFromProgram, PLATFORM_BRANDING, type Branding } from '@/lib/programs/branding';

export type Program = Tables<'programs'>;
export type SupportType = Tables<'support_types'>;

/** 행사 1건 (서비스롤 — 호출부가 멤버십을 검증한다) */
export const getProgram = cache(async (programId: string): Promise<Program | null> => {
  const { data } = await createAdminClient().from('programs').select('*').eq('id', programId).maybeSingle();
  return data ?? null;
});

/** 행사 브랜딩 (없으면 플랫폼 기본) */
export const getBranding = cache(async (programId: string | null): Promise<Branding> => {
  if (!programId) return PLATFORM_BRANDING;
  const p = await getProgram(programId);
  return p ? brandingFromProgram(p) : PLATFORM_BRANDING;
});

export interface MyProgram {
  program: Program;
  /** 멤버십 활성 여부 (플랫폼 관리자는 항상 true) */
  memberActive: boolean;
  joinedAt: string | null;
  /** 이 행사 안에서의 역할 (program_members.role, 소속 없는 플랫폼 관리자는 기본 역할) */
  role: UserRole;
}

/**
 * 내가 귀속된 행사 목록. 플랫폼 관리자는 전체.
 * 허브(§18-2)가 활성/종료 탭으로 나눠 보여준다.
 */
export async function listMyPrograms(userId: string, isPlatformAdmin: boolean, defaultRole: UserRole): Promise<MyProgram[]> {
  const admin = createAdminClient();
  if (isPlatformAdmin) {
    const [{ data }, { data: mine }] = await Promise.all([
      admin.from('programs').select('*').order('status').order('created_at', { ascending: false }),
      admin.from('program_members').select('program_id, role').eq('user_id', userId).eq('is_active', true),
    ]);
    const roleOf = new Map((mine ?? []).map((m) => [m.program_id, m.role as UserRole]));
    return (data ?? []).map((program) => ({ program, memberActive: true, joinedAt: null, role: roleOf.get(program.id) ?? defaultRole }));
  }
  const { data: memberships } = await admin
    .from('program_members')
    .select('program_id, is_active, joined_at, role')
    .eq('user_id', userId);
  const ids = (memberships ?? []).map((m) => m.program_id);
  if (ids.length === 0) return [];
  const { data: programs } = await admin.from('programs').select('*').in('id', ids);
  const byId = new Map((programs ?? []).map((p) => [p.id, p]));
  const out: MyProgram[] = [];
  for (const m of memberships ?? []) {
    const program = byId.get(m.program_id);
    if (program) out.push({ program, memberActive: m.is_active, joinedAt: m.joined_at, role: (m.role as UserRole) ?? defaultRole });
  }
  return out.sort((a, b) =>
    a.program.status === b.program.status ? 0 : a.program.status === 'active' ? -1 : 1,
  );
}

/** 행사 멤버십(활성) 여부 — 플랫폼 관리자는 항상 true */
export async function isProgramMember(userId: string, programId: string, isPlatformAdmin: boolean): Promise<boolean> {
  if (isPlatformAdmin) return true;
  const { data } = await createAdminClient()
    .from('program_members')
    .select('id')
    .eq('program_id', programId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}

/** 행사의 사업그룹 목록 (정렬순) */
export const listSupportTypes = cache(async (programId: string): Promise<SupportType[]> => {
  const { data } = await createAdminClient()
    .from('support_types')
    .select('*')
    .eq('program_id', programId)
    .order('sort_order')
    .order('created_at');
  return data ?? [];
});

export const getSupportType = cache(async (supportTypeId: string): Promise<SupportType | null> => {
  const { data } = await createAdminClient().from('support_types').select('*').eq('id', supportTypeId).maybeSingle();
  return data ?? null;
});

export interface MyGroup {
  group: SupportType;
  /** 이 그룹에서의 내 케이스 수(멘티) / 담당 케이스 수(멘토) / 전체 케이스 수(스태프) */
  caseCount: number;
}

/**
 * 행사 안에서 내가 들어갈 수 있는 그룹.
 *  - 스태프·플랫폼 관리자: 행사의 모든 그룹
 *  - 멘토: 그룹 명부(support_type_members) 또는 담당 케이스가 있는 그룹
 *  - 멘티: 내 케이스가 있는 그룹
 */
export async function listMyGroups(
  programId: string,
  user: { id: string; role: UserRole; isPlatformAdmin: boolean },
): Promise<MyGroup[]> {
  const admin = createAdminClient();
  const groups = await listSupportTypes(programId);
  if (groups.length === 0) return [];
  const groupIds = groups.map((g) => g.id);

  if (user.isPlatformAdmin || user.role === 'institution' || user.role === 'nextlab') {
    const { data: cases } = await admin.from('cases').select('support_type_id').in('support_type_id', groupIds);
    const counts = countBy((cases ?? []).map((c) => c.support_type_id));
    return groups.map((group) => ({ group, caseCount: counts.get(group.id) ?? 0 }));
  }

  if (user.role === 'mentee') {
    const { data: cases } = await admin
      .from('cases')
      .select('support_type_id')
      .eq('mentee_id', user.id)
      .in('support_type_id', groupIds);
    const counts = countBy((cases ?? []).map((c) => c.support_type_id));
    return groups.filter((g) => counts.has(g.id)).map((group) => ({ group, caseCount: counts.get(group.id) ?? 0 }));
  }

  // mentor
  const [{ data: roster }, { data: assigns }] = await Promise.all([
    admin
      .from('support_type_members')
      .select('support_type_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('support_type_id', groupIds),
    admin.from('mentor_assignments').select('case_id, cases!inner(support_type_id)').eq('mentor_id', user.id).eq('is_active', true),
  ]);
  const rosterIds = new Set((roster ?? []).map((r) => r.support_type_id));
  const assignedGroupIds = (assigns ?? [])
    .map((a) => (a.cases as unknown as { support_type_id: string } | null)?.support_type_id)
    .filter((x): x is string => !!x && groupIds.includes(x));
  const counts = countBy(assignedGroupIds);
  return groups
    .filter((g) => rosterIds.has(g.id) || counts.has(g.id))
    .map((group) => ({ group, caseCount: counts.get(group.id) ?? 0 }));
}

function countBy(values: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}
