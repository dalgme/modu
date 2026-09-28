import { NextResponse } from 'next/server';

import { safeEqual } from '@/lib/auth/secret';
import { createAdminClient } from '@/lib/supabase/admin';
import { deriveBruteforceEvents, escalate, findUnalerted, lastSecurityAlertAt, markAlerted, securityKindLabel, type UnalertedEvent } from '@/lib/ops/security-events';
import { sendSms } from '@/lib/notifications/provider';
import { normalizePhone } from '@/lib/utils/phone';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get('authorization'), `Bearer ${secret}`);
}

/** 최근 이 시간(분) 안의 미통보 이벤트를 모은다 */
const LOOKBACK_MIN = 15;
/** 마지막 문자 후 이 시간(분) 안에는 warn 이 또 생겨도 문자를 보내지 않는다 (critical 은 무시) */
const COOLDOWN_MIN = 30;
const PLATFORM_NAME = '멘토링 운영관리 플랫폼';

function buildAlertText(rows: UnalertedEvent[], effective: Map<string, 'info' | 'warn' | 'critical'>, reasons: string[], hasCritical: boolean): string {
  const byKind = new Map<string, number>();
  const paths = new Map<string, number>();
  for (const r of rows) {
    const sev = effective.get(r.id) ?? 'info';
    if (sev === 'info') continue;
    byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    if (r.path) paths.set(r.path, (paths.get(r.path) ?? 0) + 1);
  }
  const kinds = Array.from(byKind.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${securityKindLabel(k)} ${n}건`)
    .join(', ');
  const topPaths = Array.from(paths.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([p, n]) => `${p.length > 40 ? `${p.slice(0, 39)}…` : p}(${n})`)
    .join(', ');
  const lines = [
    `[${PLATFORM_NAME}] ${hasCritical ? '심각' : '주의'} 보안 이벤트 (최근 ${LOOKBACK_MIN}분)`,
    kinds,
    topPaths ? `경로: ${topPaths}` : null,
    reasons.length > 0 ? reasons.slice(0, 2).join(' / ') : null,
    '플랫폼 콘솔 > 보안 이벤트에서 확인하세요.',
  ].filter((l): l is string => !!l);
  return lines.join('\n');
}

/** 수신자 = 플랫폼 관리자(휴대폰 있는 활성 계정) + OPS_ALERT_PHONES(콤마, 선택). 중복 제거. error-alert 와 동일. */
async function loadRecipients(): Promise<string[]> {
  const phones = new Set<string>();
  try {
    const { data } = await createAdminClient().from('users').select('phone').eq('is_platform_admin', true).eq('is_active', true).not('phone', 'is', null);
    for (const u of data ?? []) {
      const p = normalizePhone(u.phone);
      if (p) phones.add(p);
    }
  } catch (e) {
    console.error('[security-alert] 수신자 조회 실패', e instanceof Error ? e.message : e);
  }
  for (const raw of (process.env.OPS_ALERT_PHONES ?? '').split(',')) {
    const p = normalizePhone(raw.trim());
    if (p) phones.add(p);
  }
  return Array.from(phones);
}

/**
 * Vercel Cron (5분마다): 보안 이벤트 통보 (P35-B). error-alert 와 같은 구조.
 * 1) login_attempts(P35-A) 에서 로그인 실패 폭주를 bruteforce(critical) 로 파생(표 없으면 0건)
 * 2) 최근 15분 미통보 이벤트를 모아 승격 판정(같은 사용자 반출 5회·권한 거부 10회/10분 → warn)
 * 3) warn 이상이 하나라도 있으면 플랫폼 관리자 + OPS_ALERT_PHONES 에 문자 1통. 마지막 통보 30분 이내면 생략(쿨다운) — critical 은 쿨다운 무시.
 * 4) 모은 이벤트(info 포함) 전부 alerted_at 처리. 문자 발송은 try/catch 격리(§6-5), 실패해도 alerted_at 은 채운다.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let derived = 0;
  try {
    derived = await deriveBruteforceEvents();
  } catch (e) {
    console.error('[security-alert] bruteforce 파생 실패', e instanceof Error ? e.message : e);
  }

  const rows = await findUnalerted(LOOKBACK_MIN);
  if (rows.length === 0) return NextResponse.json({ events: 0, derived, sent: 0, cooldown: false });

  const { effective, reasons } = escalate(rows);
  const ids = rows.map((r) => r.id);
  let hasWarn = false;
  let hasCritical = false;
  effective.forEach((sev) => {
    if (sev === 'warn') hasWarn = true;
    if (sev === 'critical') hasCritical = true;
  });
  if (!hasWarn && !hasCritical) {
    // info 만 — 통보 없이 처리 표시(직전 통보 시각 유지)
    const last = await lastSecurityAlertAt();
    await markAlerted(ids, last ?? new Date(0).toISOString());
    return NextResponse.json({ events: rows.length, derived, sent: 0, cooldown: false, infoOnly: true });
  }

  const last = await lastSecurityAlertAt();
  const lastMs = last ? new Date(last).getTime() : 0;
  if (!hasCritical && last && Date.now() - lastMs < COOLDOWN_MIN * 60_000) {
    await markAlerted(ids, last);
    return NextResponse.json({ events: rows.length, derived, sent: 0, cooldown: true });
  }

  const text = buildAlertText(rows, effective, reasons, hasCritical);
  const recipients = await loadRecipients();
  let sent = 0;
  for (const to of recipients) {
    try {
      const r = await sendSms(to, text, null);
      if (r.ok) sent += 1;
      else console.error('[security-alert] 문자 실패', to.slice(-4), r.error);
    } catch (e) {
      console.error('[security-alert] 문자 예외', to.slice(-4), e instanceof Error ? e.message : e);
    }
  }
  await markAlerted(ids);
  return NextResponse.json({ events: rows.length, derived, sent, cooldown: false, critical: hasCritical, recipients: recipients.length, reasons });
}
