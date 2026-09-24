'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getRealSessionProfile } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/workflow/audit';
import {
  VIEW_AS_COOKIE,
  allowedTargetRoles,
  buildViewAsCookie,
  getImpersonation,
  readViewAsPayload,
  safeInternalPath,
  viewAsConfigured,
} from '@/lib/auth/impersonation';
import { roleHome } from '@/lib/auth/roles';
import { contextOrNull, writeContextCookie } from '@/lib/programs/context';
import { enterProgram } from '@/lib/programs/enter';
import { denyUnless } from '@/lib/auth/capabilities';

import { membershipRole } from '@/lib/auth/program-role';

export type ViewAsResult = { ok: true } | { ok: false; error: string };

export interface ViewAsOptions {
  /** 이 케이스로 바로 진입 (멘토 → /mentor/cases/{id}, 멘티 → /mentee/rounds). 대상이 그 케이스의 담당 멘토/멘티여야 한다 */
  caseId?: string | null;
  /** 대행 종료 후 돌아갈 실행자 콘솔 경로 (앱 내부 경로만) */
  returnTo?: string | null;
}

/**
 * 대행 시작 — 실행자가 대상 회원 명의로 화면에 진입해 실제 업무를 수행할 수 있게 한다 (P19 확장, P31 재작성).
 *  - 운영사 담당자: 멘토·멘티 대행 (행사 컨텍스트 + members.view_as 권한). **대행은 현재 행사에 묶인다** —
 *    쿠키에 행사 id 를 넣고 매 요청 컨텍스트 행사와 대조하므로 다른 행사로 새지 않는다.
 *  - 플랫폼 관리자: 발주처·운영사·멘토·멘티 대행 (다른 플랫폼 관리자는 불가) — 허브 경유 라우팅(P19) 유지.
 * 실제 신원 확인 → 대상 검증 → 서명 쿠키 발급 → 대상 명의 컨텍스트 쿠키 작성(허브 왕복 제거) → 감사기록 → 대상 화면으로 이동.
 */
export async function startViewAsAction(targetUserId: string, opts: ViewAsOptions = {}): Promise<ViewAsResult> {
  const real = await getRealSessionProfile();
  if (!real || !real.is_active) return { ok: false, error: '로그인이 필요합니다.' };
  if (await getImpersonation()) return { ok: false, error: '이미 대행 중입니다. 먼저 [대행 종료]를 누르세요.' };
  const isAdmin = real.is_platform_admin;
  const allowed = allowedTargetRoles(real);
  if (allowed.length === 0) return { ok: false, error: '대행 권한이 없습니다.' };
  let programId: string | null = null;
  let actorGroupId: string | null = null;
  if (!isAdmin) {
    // 운영사 실행자는 행사 컨텍스트 안에서 대행 권한이 있어야 한다 (P31: members.sensitive 에서 분리)
    const c = await contextOrNull(real);
    if (!c) return { ok: false, error: '행사를 먼저 선택하세요.' };
    const denied = denyUnless(c, 'members.view_as');
    if (denied) return { ok: false, error: denied };
    programId = c.programId;
    actorGroupId = c.supportTypeId;
  }
  if (!viewAsConfigured()) {
    return { ok: false, error: '대행 기능이 구성되지 않았습니다. (서버 시크릿 미설정)' };
  }

  const admin = createAdminClient();
  const { data: target } = await admin.from('users').select('*').eq('id', targetUserId).maybeSingle();
  if (!target) return { ok: false, error: '대상 회원을 찾을 수 없습니다.' };
  if (!target.is_active) return { ok: false, error: '비활성 회원은 대행할 수 없습니다.' };
  if (target.is_platform_admin) return { ok: false, error: '플랫폼 관리자 계정은 대행할 수 없습니다.' };
  if (target.id === real.id) return { ok: false, error: '본인은 대행할 수 없습니다.' };
  // 운영사 실행자는 이 행사 안에서의 역할로 판정 (설계 B). 관리자는 계정 기본 역할로 진입 후 허브가 라우팅.
  if (programId) {
    // 대상은 **현재 행사의 활성 멤버**(program_members)이고 그 행사 안 역할이 멘토·멘티여야 한다 — 다른 행사 회원 대행 차단
    const { data: mem } = await admin.from('program_members').select('role, is_active').eq('program_id', programId).eq('user_id', target.id).maybeSingle();
    if (!mem || !mem.is_active) return { ok: false, error: '이 행사 소속(활성) 회원만 대행할 수 있습니다.' };
    target.role = (await membershipRole(target.id, programId)) ?? mem.role;
  }
  if (!allowed.includes(target.role)) {
    return { ok: false, error: isAdmin ? '이 계정은 대행할 수 없습니다.' : '멘토·멘티 계정만 대행할 수 있습니다.' };
  }

  // 케이스 지정: 대상이 그 케이스의 담당 멘토(활성 배정) 또는 멘티인지 확인하고, 그 케이스의 그룹으로 컨텍스트를 맞춘다
  let caseId: string | null = null;
  let groupId: string | null = null;
  if (opts.caseId) {
    const { data: c } = await admin.from('cases').select('id, program_id, support_type_id, mentee_id').eq('id', opts.caseId).maybeSingle();
    if (!c || (programId && c.program_id !== programId)) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
    if (target.role === 'mentor') {
      const { data: a } = await admin.from('mentor_assignments').select('id').eq('case_id', c.id).eq('mentor_id', target.id).eq('is_active', true).maybeSingle();
      if (!a) return { ok: false, error: '이 멘토는 해당 케이스의 담당 멘토가 아닙니다.' };
    } else if (target.role === 'mentee' && c.mentee_id !== target.id) {
      return { ok: false, error: '이 멘티는 해당 케이스의 멘티가 아닙니다.' };
    }
    caseId = c.id;
    groupId = c.support_type_id;
    if (!programId) programId = c.program_id;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const value = buildViewAsCookie({
    actorId: real.id,
    targetId: target.id,
    targetRole: target.role,
    programId: isAdmin ? null : programId,
    actorGroupId,
    caseId,
    returnTo: opts.returnTo ?? null,
    nowSec,
  });
  if (!value) return { ok: false, error: '대행 세션 발급에 실패했습니다.' };

  // 세션 쿠키(maxAge 없음) — 브라우저를 닫으면 대행이 끝난다. 서버 TTL(8시간)은 payload.exp 로 유지 (P31)
  cookies().set(VIEW_AS_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });

  await logAudit(admin, {
    actorId: real.id,
    programId,
    action: 'impersonation.start',
    entityType: 'users',
    entityId: target.id,
    metadata: { target_name: target.name, target_role: target.role, actor_platform_admin: isAdmin, case_id: caseId },
  });

  // 관리자는 허브로 — 대상의 행사 멤버십에 따라 자동 진입·라우팅된다.
  if (isAdmin) redirect('/hub');

  // 운영사: 대상 명의 컨텍스트 쿠키를 바로 써서 허브 왕복 없이 대상 화면으로 (P31). 케이스가 있으면 그 그룹 범위.
  const entered = await enterProgram(real, target, programId!, groupId, false);
  // 대상이 그룹 2개 이상이면 허브의 그룹 목록으로 (→ /hub/enter 왕복 루프 방지, P32 리뷰 #1)
  if (!entered.ok) redirect(entered.redirectTo);
  if (caseId) redirect(target.role === 'mentor' ? `/mentor/cases/${caseId}` : '/mentee/rounds');
  redirect(roleHome(target.role));
}

/** 대행 종료 — 쿠키 삭제 + 실행자 컨텍스트 복원 + 감사기록 후 복귀 (returnTo → 관리자 계정 조회 / 운영사 회원 명단). */
export async function stopViewAsAction(): Promise<void> {
  const imp = await getImpersonation();
  const real = await getRealSessionProfile();
  const payload = readViewAsPayload();
  cookies().delete(VIEW_AS_COOKIE);
  if (imp && real) {
    await logAudit(createAdminClient(), {
      actorId: real.id,
      programId: imp.programId,
      action: 'impersonation.stop',
      entityType: 'users',
      entityId: imp.target.id,
      metadata: { target_name: imp.target.name, case_id: imp.caseId },
    });
  }
  // 운영사 실행자: 대행 전 행사·그룹 범위로 컨텍스트 쿠키를 되돌린다 (허브 왕복 제거, P31)
  if (real && !real.is_platform_admin && payload?.programId) {
    writeContextCookie(real.id, payload.programId, payload.actorGroupId);
  }
  const back = safeInternalPath(payload?.returnTo);
  if (back) redirect(back);
  redirect(real?.is_platform_admin ? '/platform/users' : '/nextlab/roster');
}
