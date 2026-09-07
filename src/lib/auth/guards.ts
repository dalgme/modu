import { cache } from 'react';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';
import { roleHome, type UserRole } from '@/lib/auth/roles';
import { getImpersonation } from '@/lib/auth/impersonation';

export type Profile = Tables<'users'>;

/**
 * 대행(view-as) 여부와 무관한 **실제 로그인 사용자** 프로필. 없으면 null.
 * (RLS: 본인 행 조회 허용)
 *
 * 스태프 특권 판정·비밀번호 변경·감사기록의 '실행자'는 반드시 이 함수를 쓴다.
 */
export const getRealSessionProfile = cache(async (): Promise<Profile | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
  return profile ?? null;
});

/**
 * 현재 요청의 **유효 신원**. 운영사가 회원 화면보기에서 '대행 시작'을 눌렀다면
 * 대행 대상(멘토) 프로필을, 아니면 실제 프로필을 반환한다.
 *
 * 멘토 업무·명의·데이터 스코프 → 이 함수(유효 신원)
 * 스태프 특권·감사 실행자      → getRealSessionProfile(실제 신원)
 */
export async function getSessionProfile(): Promise<Profile | null> {
  const imp = await getImpersonation();
  if (imp) return imp.target;
  return getRealSessionProfile();
}

/**
 * 로그인·활성·비밀번호 변경 완료를 강제한다. 통과 시 프로필 반환.
 * - 미로그인/프로필 없음 → /login
 * - 비활성 계정 → /login
 * - 임시 비밀번호 미변경 → /change-password
 */
export async function requireUser(): Promise<Profile> {
  const imp = await getImpersonation();
  const real = await getRealSessionProfile();
  if (!real || !real.is_active) {
    redirect('/login');
  }
  // 임시 비밀번호 판정은 항상 '실행자' 기준. 대행 대상의 플래그로 튕기면
  // /change-password 에서 실행자 본인 비밀번호가 바뀌는 사고가 난다.
  if (real.must_change_password) {
    redirect('/change-password');
  }
  const profile = imp?.target ?? real;
  if (!profile.is_active) {
    redirect('/login');
  }
  return profile;
}

/**
 * 특정 역할만 허용. 다른 역할이면 본인 홈으로 리다이렉트.
 */
export async function requireRole(allowed: UserRole[]): Promise<Profile> {
  const profile = await requireUser();
  if (!allowed.includes(profile.role)) {
    redirect(roleHome(profile.role));
  }
  return profile;
}

/**
 * 서버 액션 전용 역할 확인 — 역할이 다르면 리다이렉트하지 않고 null 을 반환한다.
 *
 * requireRole 은 역할이 다르면 roleHome 으로 redirect 하는데, 서버 액션에서 그러면
 * 페이지 전체가 이동해 버린다. 특히 운영사가 '회원 화면보기(view-as)'로 멘토 화면을
 * 열람하는 중 멘토 전용 버튼을 누르면 열람이 통째로 풀리고 운영사 대시보드로 튕긴다.
 * 액션에서는 이 함수로 확인한 뒤 { ok:false, error } 를 돌려주면 화면을 유지한 채
 * 안내만 표시할 수 있다.
 */
export async function roleOrNull(allowed: UserRole[]): Promise<Profile | null> {
  const imp = await getImpersonation();
  const real = await getRealSessionProfile();
  if (!real || !real.is_active || real.must_change_password) return null;
  const profile = imp?.target ?? real;
  if (!profile.is_active) return null;
  if (!allowed.includes(profile.role)) return null;
  return profile;
}

/** 서버 액션용 멘토 확인 (비멘토면 null — 리다이렉트하지 않음) */
export const mentorOrNull = () => roleOrNull(['mentor']);

/**
 * **실제 신원** 기준 서버 액션용 역할 확인 (리다이렉트 없음).
 *
 * ⚠️ anon RLS 클라이언트(createClient())로 쓰기를 수행하는 액션은 반드시 이 함수를 써야 한다.
 * DB 의 auth.uid() 는 대행(view-as) 쿠키로 치환되지 않으므로, `author_id = auth.uid()` 류
 * with check 정책에 유효 신원(대행 대상) id 를 넣으면 RLS 위반이 난다.
 */
export async function realRoleOrNull(allowed: UserRole[]): Promise<Profile | null> {
  const real = await getRealSessionProfile();
  if (!real || !real.is_active || real.must_change_password) return null;
  if (!allowed.includes(real.role)) return null;
  return real;
}

/**
 * 이 케이스의 **활성 담당 멘토**로서 실행 가능한지 확인한다. (비대상이면 null)
 *
 * 대행 중에는 DB 의 auth.uid() 가 운영사(is_staff)이라 RLS 가 케이스 스코프를 막아 주지 못한다.
 * 따라서 caseId 로 스코프되는 멘토 액션은 RLS 에 기대지 말고 반드시 이 함수로 배정을 직접 확인해야 한다.
 */
export async function mentorOfCaseOrNull(caseId: string): Promise<Profile | null> {
  const profile = await roleOrNull(['mentor']);
  if (!profile || !caseId) return null;
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { data } = await createAdminClient()
    .from('mentor_assignments')
    .select('id')
    .eq('case_id', caseId)
    .eq('mentor_id', profile.id)
    .eq('is_active', true)
    .maybeSingle();
  return data ? profile : null;
}

/** 담당 배정이 없는 케이스에 멘토 액션을 시도했을 때의 공통 문구 */
export const NOT_ASSIGNED_ERROR = '담당 멘토가 아닙니다. (배정된 케이스에서만 실행할 수 있습니다)';

/** 멘토 전용 액션을 다른 역할이 눌렀을 때의 공통 안내 문구 */
export const MENTOR_ONLY_ERROR =
  '담당 멘토만 실행할 수 있습니다. 운영사는 회원관리에서 해당 멘토의 [화면 보기]로 들어가면 대행 상태가 되어 바로 처리할 수 있습니다.';

/**
 * **실제 신원** 기준 역할 가드 (스태프 콘솔 전용).
 * 대행 중에도 운영사·발주처가 자기 콘솔에서 쫓겨나지 않도록, 신원 치환의 영향을 받지 않는다.
 */
async function requireRealRole(allowed: UserRole[]): Promise<Profile> {
  const real = await getRealSessionProfile();
  if (!real || !real.is_active) redirect('/login');
  if (real.must_change_password) redirect('/change-password');
  if (!allowed.includes(real.role)) redirect(roleHome(real.role));
  return real;
}

// 스태프 콘솔 = 실제 신원 / 멘토 화면 = 유효 신원(대행 중이면 대상 멘토)
export const requireInstitution = () => requireRealRole(['institution']);
export const requireNextlab = () => requireRealRole(['nextlab']);
export const requireStaff = () => requireRealRole(['institution', 'nextlab']);
export const requireMentor = () => requireRole(['mentor']);

/**
 * 멘티 전용. 개인정보 미동의 시 동의 화면으로 유도.
 */
export async function requireMentee(): Promise<Profile> {
  const profile = await requireRole(['mentee']);
  if (!profile.privacy_agreed_at) {
    redirect('/mentee/consent');
  }
  return profile;
}

/** 플랫폼 관리자 콘솔 — 실제 신원의 is_platform_admin. 아니면 허브로. */
export async function requirePlatformAdmin(): Promise<Profile> {
  const real = await getRealSessionProfile();
  if (!real || !real.is_active) redirect('/login');
  if (real.must_change_password) redirect('/change-password');
  if (!real.is_platform_admin) redirect('/hub');
  return real;
}
