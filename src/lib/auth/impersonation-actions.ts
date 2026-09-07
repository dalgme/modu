'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireNextlab, getRealSessionProfile } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/workflow/audit';
import {
  VIEW_AS_COOKIE,
  VIEW_AS_TTL_SEC,
  ALLOWED_TARGET_ROLES,
  buildViewAsCookie,
  getImpersonation,
  viewAsConfigured,
} from '@/lib/auth/impersonation';
import { roleHome } from '@/lib/auth/roles';

export type ViewAsResult = { ok: true } | { ok: false; error: string };

/**
 * 대행 시작 — 운영사가 대상 회원(멘토) 명의로 실제 업무를 수행할 수 있게 한다.
 * requireNextlab(실제 신원) → 대상 검증 → 서명 쿠키 발급 → 감사기록.
 * 성공하면 대상 역할의 홈으로 이동한다.
 */
export async function startViewAsAction(targetUserId: string): Promise<ViewAsResult> {
  const real = await requireNextlab();
  if (!viewAsConfigured()) {
    return { ok: false, error: '대행 기능이 구성되지 않았습니다. (서버 시크릿 미설정)' };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from('users')
    .select('id, name, role, is_active')
    .eq('id', targetUserId)
    .maybeSingle();
  if (!target) return { ok: false, error: '대상 회원을 찾을 수 없습니다.' };
  if (!target.is_active) return { ok: false, error: '비활성 회원은 대행할 수 없습니다.' };
  if (!ALLOWED_TARGET_ROLES.includes(target.role)) {
    return { ok: false, error: '멘토 계정만 대행할 수 있습니다.' };
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
    action: 'impersonation.start',
    entityType: 'users',
    entityId: target.id,
    metadata: { target_name: target.name, target_role: target.role },
  });

  redirect(roleHome(target.role));
}

/** 대행 종료 — 쿠키 삭제 + 감사기록 후 회원관리로 복귀. */
export async function stopViewAsAction(): Promise<void> {
  const imp = await getImpersonation();
  const real = await getRealSessionProfile();
  cookies().delete(VIEW_AS_COOKIE);
  if (imp && real) {
    await logAudit(createAdminClient(), {
      actorId: real.id,
      action: 'impersonation.stop',
      entityType: 'users',
      entityId: imp.target.id,
      metadata: { target_name: imp.target.name },
    });
  }
  redirect('/nextlab/members');
}
