'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getRealSessionProfile } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/workflow/audit';
import {
  VIEW_AS_COOKIE,
  VIEW_AS_TTL_SEC,
  allowedTargetRoles,
  buildViewAsCookie,
  getImpersonation,
  viewAsConfigured,
} from '@/lib/auth/impersonation';
import { roleHome } from '@/lib/auth/roles';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';

import { currentProgramIdFromCookie, membershipRole } from '@/lib/auth/program-role';

export type ViewAsResult = { ok: true } | { ok: false; error: string };

/**
 * 대행 시작 — 실행자가 대상 회원 명의로 화면에 진입해 실제 업무를 수행할 수 있게 한다 (P19 확장).
 *  - 운영사 담당자: 멘토·멘티 대행 (행사 컨텍스트 + members.sensitive 권한 필요)
 *  - 플랫폼 관리자: 발주처·운영사·멘토·멘티 대행 (다른 플랫폼 관리자는 불가)
 * 실제 신원 확인 → 대상 검증 → 서명 쿠키 발급 → 감사기록. 성공 시 대상 화면으로 이동.
 */
export async function startViewAsAction(targetUserId: string): Promise<ViewAsResult> {
  const real = await getRealSessionProfile();
  if (!real || !real.is_active) return { ok: false, error: '로그인이 필요합니다.' };
  const isAdmin = real.is_platform_admin;
  const allowed = allowedTargetRoles(real);
  if (allowed.length === 0) return { ok: false, error: '대행 권한이 없습니다.' };
  if (!isAdmin) {
    // 운영사 실행자는 행사 컨텍스트 안에서 민감정보 권한이 있어야 한다 (기존 규칙 유지)
    const c = await contextOrNull(real);
    const denied = c ? denyUnless(c, 'members.sensitive') : '행사를 먼저 선택하세요.';
    if (denied) return { ok: false, error: denied };
  }
  if (!viewAsConfigured()) {
    return { ok: false, error: '대행 기능이 구성되지 않았습니다. (서버 시크릿 미설정)' };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from('users')
    .select('id, name, role, is_active, is_platform_admin')
    .eq('id', targetUserId)
    .maybeSingle();
  if (!target) return { ok: false, error: '대상 회원을 찾을 수 없습니다.' };
  if (!target.is_active) return { ok: false, error: '비활성 회원은 대행할 수 없습니다.' };
  if (target.is_platform_admin) return { ok: false, error: '플랫폼 관리자 계정은 대행할 수 없습니다.' };
  // 운영사 실행자는 이 행사 안에서의 역할로 판정 (설계 B). 관리자는 계정 기본 역할로 진입 후 허브가 라우팅.
  let programId: string | null = null;
  if (!isAdmin) {
    const ctx = await contextOrNull(real);
    if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
    programId = ctx.programId;
    // 대상은 **현재 행사의 활성 멤버**(program_members)이고 그 행사 안 역할이 멘토·멘티여야 한다 — 다른 행사 회원 대행 차단
    const { data: mem } = await admin.from('program_members').select('role, is_active').eq('program_id', ctx.programId).eq('user_id', target.id).maybeSingle();
    if (!mem || !mem.is_active) return { ok: false, error: '이 행사 소속(활성) 회원만 대행할 수 있습니다.' };
    target.role = (await membershipRole(target.id, ctx.programId)) ?? mem.role;
  }
  if (!allowed.includes(target.role)) {
    return { ok: false, error: isAdmin ? '이 계정은 대행할 수 없습니다.' : '멘토·멘티 계정만 대행할 수 있습니다.' };
  }
  if (target.id === real.id) return { ok: false, error: '본인은 대행할 수 없습니다.' };

  const nowSec = Math.floor(Date.now() / 1000);
  const value = buildViewAsCookie({
    actorId: real.id,
    targetId: target.id,
    targetRole: target.role,
    nowSec,
  });
  if (!value) return { ok: false, error: '대행 세션 발급에 실패했습니다.' };

  cookies().set(VIEW_AS_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: VIEW_AS_TTL_SEC,
  });

  await logAudit(admin, {
    actorId: real.id,
    programId,
    action: 'impersonation.start',
    entityType: 'users',
    entityId: target.id,
    metadata: { target_name: target.name, target_role: target.role, actor_platform_admin: isAdmin },
  });

  // 관리자는 허브로 — 대상의 행사 멤버십에 따라 자동 진입·라우팅된다. 운영사는 대상 역할 홈으로.
  redirect(isAdmin ? '/hub' : roleHome(target.role));
}

/** 대행 종료 — 쿠키 삭제 + 감사기록 후 실행자 콘솔로 복귀 (관리자 → 계정 통합 조회 / 운영사 → 회원관리). */
export async function stopViewAsAction(): Promise<void> {
  const imp = await getImpersonation();
  const real = await getRealSessionProfile();
  // 대행 중 컨텍스트 쿠키는 대상 명의라 contextOrNull(real) 이 null — 쿠키의 행사 id 만 읽어 감사 범위로 쓴다
  const programId = currentProgramIdFromCookie();
  cookies().delete(VIEW_AS_COOKIE);
  if (imp && real) {
    await logAudit(createAdminClient(), {
      actorId: real.id,
      programId,
      action: 'impersonation.stop',
      entityType: 'users',
      entityId: imp.target.id,
      metadata: { target_name: imp.target.name },
    });
  }
  redirect(real?.is_platform_admin ? '/platform/users' : '/nextlab/roster');
}
