import 'server-only';

import { cache } from 'react';

import { createAdminClient } from '@/lib/supabase/admin';
import { readContextPayload } from '@/lib/programs/context-cookie';
import type { UserRole } from '@/lib/auth/roles';
import { isStaffGrade, type StaffGrade } from '@/lib/auth/capabilities';

/**
 * 행사별 역할 (설계 B, 마이그레이션 0059).
 * 한 계정이 행사마다 다른 역할을 가질 수 있으므로, **현재 행사 컨텍스트 안에서는**
 * `program_members.role` 이 `users.role`(기본 역할) 을 대체한다.
 * 가드(`getRealSessionProfile`/`getSessionProfile`)가 프로필의 role 을 이 값으로 바꿔 주기 때문에
 * 하위 코드는 `profile.role` 만 읽으면 된다.
 */
export const membershipInfo = cache(async (userId: string, programId: string): Promise<{ role: UserRole; grade: StaffGrade | null; duty: string | null } | null> => {
  const { data } = await createAdminClient()
    .from('program_members')
    .select('role, grade, duty')
    .eq('program_id', programId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (!data) return null;
  return { role: data.role as UserRole, grade: isStaffGrade(data.grade) ? data.grade : null, duty: data.duty };
});

export async function membershipRole(userId: string, programId: string): Promise<UserRole | null> {
  return (await membershipInfo(userId, programId))?.role ?? null;
}

/** 현재 컨텍스트 쿠키가 가리키는 행사 id (서명·만료만 검사) */
export function currentProgramIdFromCookie(): string | null {
  return readContextPayload()?.p ?? null;
}

/** 프로필의 role 을 현재 행사 안의 역할로 치환한다. 컨텍스트가 없거나 소속이 없으면 그대로. */
export async function withProgramRole<T extends { id: string; role: UserRole }>(profile: T): Promise<T> {
  const programId = currentProgramIdFromCookie();
  if (!programId) return profile;
  const role = await membershipRole(profile.id, programId);
  if (!role || role === profile.role) return profile;
  return { ...profile, role };
}
