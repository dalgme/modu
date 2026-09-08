import 'server-only';

import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 행사/그룹 컨텍스트 쿠키의 순수 인코딩·디코딩. (guards 를 import 하지 않아 순환 참조가 없다)
 * 소비자: `programs/context.ts`(검증·객체화), `auth/program-role.ts`(현재 행사의 역할 해석).
 */
export const CONTEXT_COOKIE = 'modu_ctx';
export const CONTEXT_TTL_SEC = 30 * 24 * 60 * 60; // 30일 — 전환은 허브에서

export interface ContextPayload {
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

export function encodeContextCookie(payload: ContextPayload): string | null {
  const key = signingKey();
  if (!key) return null;
  const json = JSON.stringify(payload);
  return `${b64url(Buffer.from(json))}.${sign(json, key)}`;
}

export function decodeContextCookie(raw: string | undefined): ContextPayload | null {
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
    const p = JSON.parse(json) as ContextPayload;
    if (p.v !== 1 || !p.u || !p.p || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

/** 현재 요청의 컨텍스트 쿠키 페이로드 (서명·만료만 검사, 멤버십 검증은 context.ts) */
export function readContextPayload(): ContextPayload | null {
  return decodeContextCookie(cookies().get(CONTEXT_COOKIE)?.value);
}
