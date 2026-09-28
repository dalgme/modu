import { type NextFetchEvent, type NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

/**
 * (P35-B) 경량 해킹 시도 감지 — Edge 런타임이라 DB 를 직접 만지지 않고 내부 라우트 POST /api/ops/security-event 로 넘긴다(비대기, waitUntil).
 *  - 스캐너 패턴: 경로·쿼리에 .php / wp-admin / .env / ..%2f / <script 등 → kind='scan', reason='pattern' (IP 당 10분에 1회만 보고)
 *  - 요청 폭주: 같은 IP 가 1분 내 /api/* 또는 /login 을 40회 이상 → kind='scan', reason='burst' (IP 당 10분에 1회만 보고)
 *    ※ 미들웨어는 응답 상태(404/401)를 알 수 없어 요청 횟수로 근사한다. 카운터는 인스턴스 메모리 — 인스턴스마다 따로 세지만 완화 목적이라 충분하다.
 *  - 내부 수신 라우트·Cron·헬스는 감지 대상에서 제외(루프·오탐 방지).
 */
const BURST_LIMIT = 40;
const BURST_WINDOW_MS = 60_000;
const REPORT_COOLDOWN_MS = 10 * 60_000;
const SCANNER_PATTERN = /\.php(?:$|[?/])|wp-admin|wp-login|xmlrpc|phpmyadmin|\/\.env(?:$|[.?/])|\/\.git(?:$|[?/])|\.\.%2f|%2e%2e|<script|\/etc\/passwd|cgi-bin|\.asp(?:x)?(?:$|[?/])/i;
const SKIP_PREFIXES = ['/api/ops/security-event', '/api/cron/', '/api/health', '/api/client-error'];

const hits = new Map<string, { start: number; count: number }>();
const reported = new Map<string, number>();

function clientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : null)?.trim() || request.headers.get('x-real-ip')?.trim() || request.ip || 'unknown';
}

async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function shouldReport(ip: string, reason: string, now: number): boolean {
  const key = `${reason}:${ip}`;
  const last = reported.get(key) ?? 0;
  if (now - last < REPORT_COOLDOWN_MS) return false;
  reported.set(key, now);
  if (reported.size > 2000) {
    reported.forEach((v, k) => {
      if (now - v >= REPORT_COOLDOWN_MS) reported.delete(k);
    });
  }
  return true;
}

function burst(ip: string, now: number): number | null {
  let w = hits.get(ip);
  if (!w || now - w.start >= BURST_WINDOW_MS) {
    w = { start: now, count: 0 };
    hits.set(ip, w);
  }
  w.count += 1;
  if (hits.size > 5000) {
    hits.forEach((v, k) => {
      if (now - v.start >= BURST_WINDOW_MS) hits.delete(k);
    });
  }
  return w.count === BURST_LIMIT ? w.count : null;
}

function detect(request: NextRequest, event: NextFetchEvent): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const { pathname, search } = request.nextUrl;
  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return;
  const now = Date.now();
  const ip = clientIp(request);
  const target = pathname + search;

  let reason: string | null = null;
  let count: number | undefined;
  if (SCANNER_PATTERN.test(target)) {
    reason = 'pattern';
  } else if (pathname.startsWith('/api/') || pathname === '/login') {
    const c = burst(ip, now);
    if (c !== null) {
      reason = 'burst';
      count = c;
    }
  }
  if (!reason || !shouldReport(ip, reason, now)) return;

  event.waitUntil(
    (async () => {
      try {
        const ipHash = await hashIp(ip);
        await fetch(new URL('/api/ops/security-event', request.nextUrl.origin), {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
          body: JSON.stringify({
            kind: 'scan',
            severity: 'warn',
            ipHash,
            path: target.slice(0, 200),
            detail: { reason, count, method: request.method, ua: request.headers.get('user-agent')?.slice(0, 200) ?? null },
          }),
        });
      } catch {
        /* 감지 보고 실패는 요청 처리에 영향을 주지 않는다 */
      }
    })(),
  );
}

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  try {
    detect(request, event);
  } catch {
    /* ignore */
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 다음을 제외한 모든 요청 경로에 매칭:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico
     * - 이미지·폰트 등 정적 자산
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)',
  ],
};
