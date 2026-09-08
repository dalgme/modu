import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { CONTEXT_COOKIE, CONTEXT_TTL_SEC, encodeContextCookie, readContextPayload } from '@/lib/programs/context-cookie';
import { membershipInfo } from '@/lib/auth/program-role';
import type { UserRole } from '@/lib/auth/roles';
import { resolveGrants, type CapabilityKey, type StaffGrade } from '@/lib/auth/capabilities';

import { getSessionProfile, type Profile } from '@/lib/auth/guards';
import {
  getProgram,
  getSupportType,
  isProgramMember,
  type Program,
  type SupportType,
} from '@/lib/programs/data';
import { brandingFromProgram, PLATFORM_BRANDING, type Branding } from '@/lib/programs/branding';

/**
 * 행사/그룹 컨텍스트 — docs/MODU-DESIGN.md §18.
 * 허브에서 배너를 고르면 서명된 쿠키에 {programId, supportTypeId} 를 담고,
 * 모든 역할 레이아웃이 `requireContext()` 로 읽는다. 매 요청 멤버십을 재검증한다.
 */
export interface ProgramContext {
  programId: string;
  supportTypeId: string | null;
  program: Program;
  group: SupportType | null;
  branding: Branding;
  /** 이 행사 안에서의 역할 (program_members.role, 없으면 계정 기본 역할) */
  role: UserRole;
  /** 운영사 담당 등급 (nextlab 일 때. null = 메인 담당 PL 로 취급) */
  grade: StaffGrade | null;
  /** 이 행사에서의 담당역할 메모 */
  duty: string | null;
  /** 등급 + 행사별 override 로 계산한 권한 (nextlab 외에는 빈 배열) */
  grants: CapabilityKey[];
}

/** 컨텍스트 쿠키 저장 (서버 액션·라우트 핸들러에서만 호출) */
export function writeContextCookie(userId: string, programId: string, supportTypeId: string | null): boolean {
  const now = Math.floor(Date.now() / 1000);
  const value = encodeContextCookie({ v: 1, u: userId, p: programId, g: supportTypeId, exp: now + CONTEXT_TTL_SEC });
  if (!value) return false;
  cookies().set(CONTEXT_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CONTEXT_TTL_SEC,
  });
  return true;
}

export function clearContextCookie(): void {
  cookies().set(CONTEXT_COOKIE, '', { path: '/', maxAge: 0 });
}

/**
 * 현재 컨텍스트 (없거나 검증 실패면 null).
 * 검증: 쿠키 소유자 = 현재 유효 신원, 행사 존재, 멤버십 활성(플랫폼 관리자 예외), 그룹은 그 행사 소속.
 */
export const getContext = cache(async (profileArg?: Profile | null): Promise<ProgramContext | null> => {
  const profile = profileArg === undefined ? await getSessionProfile() : profileArg;
  if (!profile) return null;
  const payload = readContextPayload();
  if (!payload || payload.u !== profile.id) return null;

  const program = await getProgram(payload.p);
  if (!program) return null;
  if (!(await isProgramMember(profile.id, program.id, profile.is_platform_admin))) return null;

  let group: SupportType | null = null;
  if (payload.g) {
    group = await getSupportType(payload.g);
    if (!group || group.program_id !== program.id) group = null;
  }
  const info = await membershipInfo(profile.id, program.id);
  const role = info?.role ?? profile.role;
  const grade = role === 'nextlab' ? (info?.grade ?? null) : null;
  return {
    programId: program.id,
    supportTypeId: group?.id ?? null,
    program,
    group,
    branding: brandingFromProgram(program),
    role,
    grade,
    duty: info?.duty ?? null,
    grants: role === 'nextlab' ? resolveGrants(grade, program.staff_permissions) : [],
  };
});

/** 컨텍스트 필수 — 없으면 허브로 (레이아웃·페이지용) */
export async function requireContext(profile?: Profile | null): Promise<ProgramContext> {
  const ctx = await getContext(profile);
  if (!ctx) redirect('/hub?pick=1');
  return ctx;
}

/** 서버 액션용 — 없으면 null (redirect 금지: CLAUDE.md §6-7) */
export async function contextOrNull(profile?: Profile | null): Promise<ProgramContext | null> {
  return getContext(profile);
}

export { PLATFORM_BRANDING, CONTEXT_COOKIE };
