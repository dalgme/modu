import 'server-only';

import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 담당자 2단계 인증(P35-A) 쿠키 2종 — 순수 인코딩·읽기·쓰기만 다룬다(DB·guards 를 import 하지 않아 순환 참조가 없다).
 *
 *  - `modu_mfa`     : 이번 로그인 세션이 OTP(또는 신뢰 기기·예외)를 통과했다는 표시. HMAC 서명(`context-cookie.ts` 와 같은 방식·키 유도),
 *                     값 = userId + 발급 시각. 세션 쿠키(브라우저를 닫으면 사라짐) + 서버 쪽 유효 24시간.
 *  - `modu_trusted` : "이 기기 30일 기억" 토큰의 **원문**. DB(trusted_devices)에는 sha256 만 저장. httpOnly·secure·lax·30일.
 *
 * `cookies().set` 은 서버 액션·라우트 핸들러에서만 허용된다(서버 컴포넌트 렌더 중 호출하면 throw).
 * 가드(서버 컴포넌트)에서 부르는 `setMfaVerified` 는 실패를 삼키므로, 신뢰 기기로 통과한 요청은 매 요청 DB 를 한 번 더 본다.
 */
export const MFA_COOKIE = 'modu_mfa';
export const TRUSTED_DEVICE_COOKIE = 'modu_trusted';
export const TRUSTED_DEVICE_TTL_SEC = 30 * 24 * 60 * 60; // 30일
/** 세션 쿠키라도 서버에서 하루 지나면 다시 묻는다 (탈취된 세션이 무기한 통과하지 않도록) */
const MFA_MAX_AGE_SEC = 24 * 60 * 60;

interface MfaPayload {
  v: 1;
  u: string; // user id (실제 로그인 사용자 — 대행 대상이 아님)
  iat: number; // 발급 시각(초)
}

function signingKey(): string | null {
  const explicit = process.env.VIEW_AS_SECRET;
  if (explicit) return explicit;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svc) return null;
  // 서비스 키를 그대로 쓰지 않고 용도별로 파생 (context-cookie.ts 와 같은 방식, 라벨만 다르다)
  return createHmac('sha256', svc).update('modu:mfa:v1').digest('hex');
}

const b64url = (buf: Buffer) => buf.toString('base64url');
function sign(json: string, key: string): string {
  return b64url(createHmac('sha256', key).update(json).digest());
}

export function encodeMfaCookie(payload: MfaPayload): string | null {
  const key = signingKey();
  if (!key) return null;
  const json = JSON.stringify(payload);
  return `${b64url(Buffer.from(json))}.${sign(json, key)}`;
}

export function decodeMfaCookie(raw: string | undefined): MfaPayload | null {
  if (!raw) return null;
  const key = signingKey();
  if (!key) return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
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
    const p = JSON.parse(json) as MfaPayload;
    if (p.v !== 1 || !p.u || typeof p.iat !== 'number') return null;
    if (p.iat + MFA_MAX_AGE_SEC < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

/** 이 요청의 세션이 `userId` 로 2단계 인증을 통과했는가 (서명·만료·사용자 일치) */
export function readMfaVerified(userId: string): boolean {
  const p = decodeMfaCookie(cookies().get(MFA_COOKIE)?.value);
  return Boolean(p && p.u === userId);
}

/**
 * 2단계 인증 통과 표시를 심는다. 서버 액션·라우트 핸들러에서만 실제로 저장되고,
 * 서버 컴포넌트 렌더 중에는 Next 가 throw 하므로 false 를 돌려준다(호출부 흐름은 깨지 않음).
 */
export function setMfaVerified(userId: string): boolean {
  const value = encodeMfaCookie({ v: 1, u: userId, iat: Math.floor(Date.now() / 1000) });
  if (!value) return false;
  try {
    cookies().set(MFA_COOKIE, value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      // maxAge 없음 = 세션 쿠키
    });
    return true;
  } catch {
    return false;
  }
}

/** 2단계 인증 표시만 지운다 — 신뢰 기기 쿠키는 유지(로그아웃 후 재로그인 시 OTP 생략용) */
export function clearMfa(): void {
  try {
    cookies().set(MFA_COOKIE, '', { path: '/', maxAge: 0 });
  } catch {
    // 렌더 중 호출 — 무시
  }
}

/** 신뢰 기기 토큰(원문) 읽기 */
export function readTrustedToken(): string | null {
  const v = cookies().get(TRUSTED_DEVICE_COOKIE)?.value;
  return v && /^[A-Za-z0-9_-]{20,128}$/.test(v) ? v : null;
}

export function setTrustedToken(token: string): void {
  cookies().set(TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TRUSTED_DEVICE_TTL_SEC,
  });
}

export function clearTrustedToken(): void {
  try {
    cookies().set(TRUSTED_DEVICE_COOKIE, '', { path: '/', maxAge: 0 });
  } catch {
    // 렌더 중 호출 — 무시
  }
}
