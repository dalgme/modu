import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHmac, timingSafeEqual } from 'node:crypto';

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
export const CONTEXT_COOKIE = 'modu_ctx';
const CONTEXT_TTL_SEC = 30 * 24 * 60 * 60; // 30일 — 전환은 허브에서

export interface ProgramContext {
  programId: string;
  supportTypeId: string | null;
  program: Program;
  group: SupportType | null;
  branding: Branding;
}

interface Payload {
  v: 1;
  u: string; // user id (유효 신원)
  p: string; // program id
  g: string | null; // support type id
  exp: number;
}

function signingKey(): string | null {
  const explicit = process.env.VIEW_AS_SECRET;
  if (explicit) return explicit;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svc) return null;
  return createHmac('sha256', svc).update('modu:ctx:v1').digest('hex');
}

const b64url = (buf: Buffer) => buf.toString('base64url');
function sign(json: string, key: string): string {
  return b64url(createHmac('sha256', key).update(json).digest());
}

function encode(payload: Payload): string | null {
  const key = signingKey();
  if (!key) return null;
  const json = JSON.stringify(payload);
  return `${b64url(Buffer.from(json))}.${sign(json, key)}`;
}

function decode(raw: string | undefined): Payload | null {
  if (!raw) return null;
  const key = signingKey();
  if (!key) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  let json: string;
  try {
    json = Buffer.from(body, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = sign(json, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(json) as Payload;
    if (p.v !== 1 || !p.u || !p.p || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

/** 컨텍스트 쿠키 저장 (서버 액션·라우트 핸들러에서만 호출) */
export function writeContextCookie(userId: string, programId: string, supportTypeId: string | null): boolean {
  const now = Math.floor(Date.now() / 1000);
  const value = encode({ v: 1, u: userId, p: programId, g: supportTypeId, exp: now + CONTEXT_TTL_SEC });
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
  const payload = decode(cookies().get(CONTEXT_COOKIE)?.value);
  if (!payload || payload.u !== profile.id) return null;

  const program = await getProgram(payload.p);
  if (!program) return null;
  if (!(await isProgramMember(profile.id, program.id, profile.is_platform_admin))) return null;

  let group: SupportType | null = null;
  if (payload.g) {
    group = await getSupportType(payload.g);
    if (!group || group.program_id !== program.id) group = null;
  }
  return {
    programId: program.id,
    supportTypeId: group?.id ?? null,
    program,
    group,
    branding: brandingFromProgram(program),
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

export { PLATFORM_BRANDING };
