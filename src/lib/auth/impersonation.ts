import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';
import type { UserRole } from '@/lib/auth/roles';

type Profile = Tables<'users'>;

export const VIEW_AS_COOKIE = 'opmap_view_as';

/** 1차 범위: 멘토만 대행한다. (멘티는 /mentee/consent 동의 게이트 때문에 제외) */
export const ALLOWED_TARGET_ROLES: UserRole[] = ['mentor'];

/** 근무 단위 TTL — 작성 중 만료로 입력이 날아가지 않도록 8시간. 종료는 '대행 종료' 버튼. */
export const VIEW_AS_TTL_SEC = 8 * 60 * 60;

export interface ImpersonationContext {
  /** 실제 로그인 사용자(운영사) id */
  actorId: string;
  /** 대행 대상(멘토) 프로필 */
  target: Profile;
  /** 만료 시각(ISO) */
  expiresAt: string;
}

interface Payload {
  v: 1;
  a: string; // actor(운영사) auth uid
  t: string; // target(멘토) uid
  r: UserRole; // target role
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

/** 대행 쿠키 값 생성 (서버 액션에서 cookies().set 으로 심는다) */
export function buildViewAsCookie(input: {
  actorId: string;
  targetId: string;
  targetRole: UserRole;
  nowSec: number;
}): string | null {
  const key = signingKey();
  if (!key) return null;
  const payload: Payload = {
    v: 1,
    a: input.actorId,
    t: input.targetId,
    r: input.targetRole,
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
  if (payload.v !== 1) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
  return payload;
}

/**
 * 요청당 1회만 평가되는 대행 컨텍스트.
 * 아래 사슬을 전부 통과해야 반환하고, 하나라도 실패하면 null → 시스템이 평소와 동일하게 동작한다(fail-closed).
 *  1) 서명 키 존재 + 쿠키 HMAC 일치 + 미만료
 *  2) payload.a === 현재 로그인 auth uid  ← 쿠키 탈취·타 계정 재사용 차단
 *  3) 실제 프로필 role === 'nextlab' && is_active
 *  4) 대상 프로필 is_active && role === payload.r && role ∈ ALLOWED_TARGET_ROLES
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
    .select('id, role, is_active')
    .eq('id', payload.a)
    .maybeSingle();
  // (3) 실행자는 활성 운영사이어야 한다
  if (!real || !real.is_active || real.role !== 'nextlab') return null;

  const { data: target } = await admin.from('users').select('*').eq('id', payload.t).maybeSingle();
  // (4) 대상은 활성 + 발급 당시 역할 그대로 + 허용 역할
  if (!target || !target.is_active) return null;
  if (target.role !== payload.r) return null;
  if (!ALLOWED_TARGET_ROLES.includes(target.role)) return null;

  return {
    actorId: payload.a,
    target,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
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
