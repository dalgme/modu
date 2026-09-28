import { NextResponse } from 'next/server';

import { safeEqual } from '@/lib/auth/secret';
import { createAdminClient } from '@/lib/supabase/admin';
import { findUnalertedSince, lastAlertedAt, markAlerted } from '@/lib/ops/error-reports';
import { sendSms } from '@/lib/notifications/provider';
import { normalizePhone } from '@/lib/utils/phone';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get('authorization'), `Bearer ${secret}`);
}

/** 최근 이 시간(분) 안의 미통보 보고를 모은다 */
const LOOKBACK_MIN = 15;
/** 마지막 문자 후 이 시간(분) 안에는 새 보고가 있어도 문자를 보내지 않는다 */
const COOLDOWN_MIN = 30;
const PLATFORM_NAME = '멘토링 운영관리 플랫폼';

function buildAlertText(rows: { digest: string | null; path: string | null }[]): string {
  const byPath = new Map<string, number>();
  const digests = new Set<string>();
  for (const r of rows) {
    const p = r.path ?? '(경로 없음)';
    byPath.set(p, (byPath.get(p) ?? 0) + 1);
    if (r.digest) digests.add(r.digest);
  }
  const topPaths = Array.from(byPath.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([p, n]) => `${p.length > 40 ? `${p.slice(0, 39)}…` : p}(${n})`)
    .join(', ');
  const codes = Array.from(digests).slice(0, 3).join(', ');
  const lines = [
    `[${PLATFORM_NAME}] 화면 오류 ${rows.length}건(최근 ${LOOKBACK_MIN}분)`,
    `경로: ${topPaths}`,
    codes ? `코드: ${codes}` : null,
    '플랫폼 콘솔 > 시스템 상태에서 확인하세요.',
  ].filter((l): l is string => !!l);
  return lines.join('\n');
}

/** 수신자 = 플랫폼 관리자(휴대폰 있는 활성 계정) + 환경변수 OPS_ALERT_PHONES(콤마 구분, 선택). 중복 제거. */
async function loadRecipients(): Promise<string[]> {
  const phones = new Set<string>();
  try {
    const { data } = await createAdminClient()
      .from('users')
      .select('phone')
      .eq('is_platform_admin', true)
      .eq('is_active', true)
      .not('phone', 'is', null);
    for (const u of data ?? []) {
      const p = normalizePhone(u.phone);
      if (p) phones.add(p);
    }
  } catch (e) {
    console.error('[error-alert] 수신자 조회 실패', e instanceof Error ? e.message : e);
  }
  for (const raw of (process.env.OPS_ALERT_PHONES ?? '').split(',')) {
    const p = normalizePhone(raw.trim());
    if (p) phones.add(p);
  }
  return Array.from(phones);
}

/**
 * Vercel Cron (5분마다): 미통보 화면 오류 보고를 모아 플랫폼 관리자 휴대폰으로 문자 1통 (P34-B).
 * - 0건이면 종료. 마지막 통보 30분 이내면 alerted_at 만 채우고(직전 통보 시각으로) 문자는 생략(쿨다운).
 * - 문자 발송은 try/catch 격리(§6-5) — 발송 실패해도 alerted_at 은 채운다(다음 회차에 같은 건을 또 보내지 않게).
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await findUnalertedSince(LOOKBACK_MIN);
  if (rows.length === 0) return NextResponse.json({ reports: 0, sent: 0, cooldown: false });

  const ids = rows.map((r) => r.id);
  const last = await lastAlertedAt();
  const lastMs = last ? new Date(last).getTime() : 0;
  if (last && Date.now() - lastMs < COOLDOWN_MIN * 60_000) {
    await markAlerted(ids, last);
    return NextResponse.json({ reports: rows.length, sent: 0, cooldown: true });
  }

  const text = buildAlertText(rows);
  const recipients = await loadRecipients();
  let sent = 0;
  for (const to of recipients) {
    try {
      const r = await sendSms(to, text, null);
      if (r.ok) sent += 1;
      else console.error('[error-alert] 문자 실패', to.slice(-4), r.error);
    } catch (e) {
      console.error('[error-alert] 문자 예외', to.slice(-4), e instanceof Error ? e.message : e);
    }
  }
  await markAlerted(ids);
  return NextResponse.json({ reports: rows.length, sent, cooldown: false, recipients: recipients.length });
}
