import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';
import type { UserRole } from '@/lib/auth/roles';
import { readContextPayload } from '@/lib/programs/context-cookie';

type Profile = Tables<'users'>;

export const VIEW_AS_COOKIE = 'opmap_view_as';

/**
 * 대행 가능 대상 (P19 확장, 2026-09-21):
 *  - 운영사 담당자 → 멘토·멘티 (동의 게이트는 대행 중 열람 통과, 동의 제출은 차단)
 *  - 플랫폼 관리자 → 발주처·운영사·멘토·멘티 (다른 플랫폼 관리자는 불가)
 */
export const OPERATOR_TARGET_ROLES: UserRole[] = ['mentor', 'mentee'];
export const PLATFORM_TARGET_ROLES: UserRole[] = ['institution', 'nextlab', 'mentor', 'mentee'];

/** 실행자 프로필에 따른 대행 가능 대상 역할 */
export function allowedTargetRoles(real: { role: UserRole; is_platform_admin: boolean }): UserRole[] {
  if (real.is_platform_admin) return PLATFORM_TARGET_ROLES;
  if (real.role === 'nextlab') return OPERATOR_TARGET_ROLES;
  return [];
}

/** 근무 단위 TTL — 작성 중 만료로 입력이 날아가지 않도록 8시간. 종료는 '대행 종료' 버튼. (쿠키 자체는 세션 쿠키, P31) */
export const VIEW_AS_TTL_SEC = 8 * 60 * 60;

export interface ImpersonationContext {
  /** 실제 로그인 사용자(운영사 또는 플랫폼 관리자) id */
  actorId: string;
  /** 실행자가 플랫폼 관리자인지 (배너 문구·종료 후 복귀 위치용) */
  actorIsPlatformAdmin: boolean;
  /** 대행 대상 프로필 (role 은 대행 행사 안의 역할로 치환됨) */
  target: Profile;
  /** 만료 시각(ISO) */
  expiresAt: string;
  /** 대행이 묶인 행사 (운영사 실행자는 필수 — 다른 행사로 새지 않는다, P31). 관리자는 null */
  programId: string | null;
  /** 운영사 실행자의 대행 전 그룹 범위 (종료 시 복원) */
  actorGroupId: string | null;
  /** 대행 시작 시 지정한 케이스 (배너·복귀 링크용) */
  caseId: string | null;
  /** 종료 후 돌아갈 실행자 콘솔 경로 (앱 내부 경로만) */
  returnTo: string | null;
}

interface Payload {
  v: 2;
  a: string; // actor(운영사) auth uid
  t: string; // target(멘토) uid
  r: UserRole; // target role (행사 안 역할)
  p: string | null; // 대행 행사 id (운영사 실행자는 필수)
  g: string | null; // 실행자의 대행 전 그룹 범위
  c: string | null; // 케이스 id
  ret: string | null; // 복귀 경로
  iat: number;
  exp: number;
}

/**
 * 쿠키 서명 키. 별도 env 없이 서버 전용 시크릿에서 파생한다.
 * VIEW_AS_SECRET 이 설정돼 있으면 그것을 우선 사용한다.
 */
function signingKey(): string | null {
  const explicit = process.env.VIEW_AS_SECRET;
  if (explicit) return explicit;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svc) return null;
  // 서비스 키를 그대로 쓰지 않고 용도 분리를 위해 파생
  return createHmac('sha256', svc).update('opmap:view-as:v1').digest('hex');
}

export function viewAsConfigured(): boolean {
  return signingKey() !== null;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

function sign(json: string, key: string): string {
  return b64url(createHmac('sha256', key).update(json).digest());
}

function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** 앱 내부 경로만 허용 (`/nextlab/...` 등). 외부 URL·프로토콜 상대 경로는 null */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.length > 512) return null;
  return raw;
}

/** 대행 쿠키 값 생성 (서버 액션에서 cookies().set 으로 심는다) */
export function buildViewAsCookie(input: {
  actorId: string;
  targetId: string;
  targetRole: UserRole;
  programId: string | null;
  actorGroupId?: string | null;
  caseId?: string | null;
  returnTo?: string | null;
  nowSec: number;
}): string | null {
  const key = signingKey();
  if (!key) return null;
  const payload: Payload = {
    v: 2,
    a: input.actorId,
    t: input.targetId,
    r: input.targetRole,
    p: input.programId,
    g: input.actorGroupId ?? null,
    c: input.caseId ?? null,
    ret: safeInternalPath(input.returnTo),
    iat: input.nowSec,
    exp: input.nowSec + VIEW_AS_TTL_SEC,
  };
  const json = JSON.stringify(payload);
  return `${b64url(Buffer.from(json))}.${sign(json, key)}`;
}

function parseCookie(raw: string): Payload | null {
  const key = signingKey();
  if (!key) return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  let json: string;
  try {
    json = Buffer.from(body, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!safeEqualStr(mac, sign(json, key))) return null;
  let payload: Payload;
  try {
    payload = JSON.parse(json) as Payload;
  } catch {
    return null;
  }
  // v1 쿠키(행사 범위 없음)는 더 이상 인정하지 않는다 — 다시 대행 시작 (P31)
  if (payload.v !== 2) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
  return payload;
}

/** 대행 쿠키의 원본 payload (종료 액션이 복원 정보를 읽는 용도) */
export function readViewAsPayload(): { programId: string | null; actorGroupId: string | null; returnTo: string | null; caseId: string | null } | null {
  const raw = cookies().get(VIEW_AS_COOKIE)?.value;
  if (!raw) return null;
  const p = parseCookie(raw);
  if (!p) return null;
  return { programId: p.p, actorGroupId: p.g, returnTo: p.ret, caseId: p.c };
}

/**
 * 요청당 1회만 평가되는 대행 컨텍스트.
 * 아래 사슬을 전부 통과해야 반환하고, 하나라도 실패하면 null → 시스템이 평소와 동일하게 동작한다(fail-closed).
 *  1) 서명 키 존재 + 쿠키 HMAC 일치 + 미만료
 *  2) payload.a === 현재 로그인 auth uid  ← 쿠키 탈취·타 계정 재사용 차단
 *  3) 실제 프로필 is_active && (플랫폼 관리자 ‖ role === 'nextlab')
 *  4) 대상 프로필 is_active && 비(非)플랫폼관리자 && 행사 안 역할 === payload.r && role ∈ 실행자별 허용 역할
 *  5) 운영사 실행자: 현재 컨텍스트 쿠키의 행사 === payload.p  ← 다른 행사로 대행이 새지 않는다 (P31)
 */
export const getImpersonation = cache(async (): Promise<ImpersonationContext | null> => {
  const raw = cookies().get(VIEW_AS_COOKIE)?.value;
  if (!raw) return null;
  const payload = parseCookie(raw);
  if (!payload) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // (2) 쿠키는 발급받은 그 계정에서만 유효
  if (user.id !== payload.a) return null;

  const admin = createAdminClient();
  const { data: real } = await admin
    .from('users')
    .select('id, role, is_active, is_platform_admin')
    .eq('id', payload.a)
    .maybeSingle();
  // (3) 실행자는 활성 플랫폼 관리자 또는 활성 운영사이어야 한다
  if (!real || !real.is_active) return null;
  const allowed = allowedTargetRoles(real);
  if (allowed.length === 0) return null;

  // (5) 운영사 실행자는 발급 당시 행사 안에서만 유효 — 컨텍스트 쿠키가 다른 행사를 가리키면 대행 무효
  if (!real.is_platform_admin) {
    if (!payload.p) return null;
    const ctxProgram = readContextPayload()?.p ?? null;
    if (ctxProgram && ctxProgram !== payload.p) return null;
    // 실행자가 그 행사의 활성 운영사인지 (설계 B: 행사별 역할)
    const { data: actorMem } = await admin.from('program_members').select('role, is_active').eq('program_id', payload.p).eq('user_id', real.id).maybeSingle();
    if (!actorMem || !actorMem.is_active || actorMem.role !== 'nextlab') return null;
  }

  const { data: target } = await admin.from('users').select('*').eq('id', payload.t).maybeSingle();
  // (4) 대상은 활성 + 비플랫폼관리자 + 발급 당시 역할 그대로 + 실행자별 허용 역할
  if (!target || !target.is_active) return null;
  if (target.is_platform_admin) return null;
  let role: UserRole = target.role;
  if (payload.p) {
    const { data: mem } = await admin.from('program_members').select('role, is_active').eq('program_id', payload.p).eq('user_id', target.id).maybeSingle();
    if (!mem || !mem.is_active) return null;
    role = mem.role;
  }
  if (role !== payload.r) return null;
  if (!allowed.includes(role)) return null;

  return {
    actorId: payload.a,
    actorIsPlatformAdmin: real.is_platform_admin,
    target: { ...target, role },
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    programId: payload.p,
    actorGroupId: payload.g,
    caseId: payload.c,
    returnTo: payload.ret,
  };
});

/**
 * case_status_history.note 등에 붙일 대행 표기.
 * changedBy 가 '대행 대상 멘토 본인'일 때만 접미어를 붙인다 →
 * 같은 대행 중 수행한 운영사 본인 명의 액션(예: 검수)은 오염되지 않는다.
 */
export async function actingNote(base: string, changedBy: string | null): Promise<string> {
  const imp = await getImpersonation();
  if (!imp || !changedBy || changedBy !== imp.target.id) return base;
  return `${base} · 운영사 대행`;
}
