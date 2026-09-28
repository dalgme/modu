import { NextResponse } from 'next/server';

import { safeEqual } from '@/lib/auth/secret';
import { recordSecurityEvent } from '@/lib/ops/security-events';

export const dynamic = 'force-dynamic';

/**
 * 미들웨어(Edge) → 보안 이벤트 수신 (P35-B). Edge 는 서비스롤 DB 접근을 하지 않으므로 이 내부 라우트로 넘긴다.
 * - 인증: `authorization: Bearer {CRON_SECRET}` (내부 토큰). 없거나 다르면 401.
 * - 본문 2KB 제한, kind/severity 화이트리스트. 응답은 202.
 */
const MAX_BODY_BYTES = 2048;
const KINDS = new Set(['scan']);
const SEVERITIES = new Set(['info', 'warn', 'critical']);

function clip(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(request.headers.get('authorization'), `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return NextResponse.json({ error: 'bad_body' }, { status: 400 });
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  const kind = clip(body.kind, 30);
  const severity = clip(body.severity, 10) ?? 'warn';
  if (!kind || !KINDS.has(kind) || !SEVERITIES.has(severity)) return NextResponse.json({ error: 'bad_kind' }, { status: 400 });
  const detail = body.detail && typeof body.detail === 'object' && !Array.isArray(body.detail) ? (body.detail as Record<string, unknown>) : {};
  try {
    await recordSecurityEvent({
      kind,
      severity: severity as 'info' | 'warn' | 'critical',
      ipHash: clip(body.ipHash, 32),
      path: clip(body.path, 200),
      detail: {
        reason: clip(detail.reason, 40),
        count: typeof detail.count === 'number' ? detail.count : undefined,
        method: clip(detail.method, 10),
        ua: clip(detail.ua, 200),
      },
    });
  } catch (e) {
    console.error('[security-event] 기록 실패', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'store_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
