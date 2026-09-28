import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

import { recordErrorReport } from '@/lib/ops/error-reports';
import { getRealSessionProfile } from '@/lib/auth/guards';
import { currentProgramIdFromCookie } from '@/lib/auth/program-role';

export const dynamic = 'force-dynamic';

/**
 * 화면 오류 보고 수신 (P34-B). 오류 경계(error.tsx / SafeSlot / global-error)가 `sendBeacon` 으로 보낸다.
 * - 인증 불필요(오류 화면은 로그인 전에도 뜬다). 로그인 세션이 있으면 user/role/program 을 덧붙이되 실패는 무시.
 * - 남용 방지: 본문 2KB 제한, 필드 길이 제한, 프로세스 내 레이트리밋(ip_hash 당 분당 5건 · 전체 분당 60건),
 *   같은 digest+path 60초 내 중복 저장 생략(recordErrorReport).
 * - 응답은 항상 202 { ok: true } — 보고 실패가 사용자 화면에 영향을 주지 않도록.
 */

const MAX_BODY_BYTES = 2048;
const PER_IP_PER_MIN = 5;
const GLOBAL_PER_MIN = 60;
const WINDOW_MS = 60_000;

// 서버리스 인스턴스 단위 메모리 레이트리밋 — 인스턴스마다 따로 세지만 남용 완화 목적이라 충분하다.
const ipWindows = new Map<string, { start: number; count: number }>();
let globalWindow = { start: 0, count: 0 };

function allow(ipHash: string, now: number): boolean {
  if (now - globalWindow.start >= WINDOW_MS) globalWindow = { start: now, count: 0 };
  if (globalWindow.count >= GLOBAL_PER_MIN) return false;
  let w = ipWindows.get(ipHash);
  if (!w || now - w.start >= WINDOW_MS) {
    w = { start: now, count: 0 };
    ipWindows.set(ipHash, w);
  }
  if (w.count >= PER_IP_PER_MIN) return false;
  w.count += 1;
  globalWindow.count += 1;
  // 메모리 상한 — 오래된 창 정리
  if (ipWindows.size > 1000) {
    ipWindows.forEach((v, k) => {
      if (now - v.start >= WINDOW_MS) ipWindows.delete(k);
    });
  }
  return true;
}

function clip(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

function hashIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  const ip = (fwd ? fwd.split(',')[0] : null)?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown';
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

const ACCEPTED = () => NextResponse.json({ ok: true }, { status: 202 });

export async function POST(request: Request) {
  const now = Date.now();
  const ipHash = hashIp(request);
  if (!allow(ipHash, now)) return ACCEPTED();

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return ACCEPTED();
  }
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return ACCEPTED();

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return ACCEPTED();
    body = parsed as Record<string, unknown>;
  } catch {
    return ACCEPTED();
  }

  const input = {
    digest: clip(body.digest, 64),
    message: clip(body.message, 300),
    path: clip(body.path, 200),
    scope: clip(body.scope, 60),
    userAgent: clip(body.ua, 300) ?? clip(request.headers.get('user-agent'), 300),
    ipHash,
    userId: null as string | null,
    role: null as string | null,
    programId: null as string | null,
  };

  // 로그인 상태면 세션에서 — 실패해도 무시 (쿠키 없음·세션 만료·DB 오류 전부 보고 저장을 막지 않는다)
  try {
    const profile = await getRealSessionProfile();
    if (profile) {
      input.userId = profile.id;
      input.role = profile.role;
      input.programId = currentProgramIdFromCookie();
    }
  } catch {
    // ignore
  }

  try {
    await recordErrorReport(input);
  } catch (e) {
    console.error('[client-error] 보고 저장 실패', e instanceof Error ? e.message : e);
  }
  return ACCEPTED();
}
