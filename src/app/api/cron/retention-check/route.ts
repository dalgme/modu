import { NextResponse } from 'next/server';

import { safeEqual } from '@/lib/auth/secret';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/notifications/provider';
import { normalizePhone } from '@/lib/utils/phone';
import { DEFAULT_RETENTION_YEARS } from '@/lib/programs/branding';
import { kstDateString as fmtDate, parsePrivacyOfficer, retentionExpiry } from '@/lib/ops/retention';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get('authorization'), `Bearer ${secret}`);
}

/** 만료 D-30 부터 알린다 */
const NOTICE_BEFORE_DAYS = 30;
/** 같은 행사에 다시 알리는 최소 간격(일) */
const RENOTIFY_DAYS = 30;
const PLATFORM_NAME = '멘토링 운영관리 플랫폼';

async function platformAdminPhones(): Promise<string[]> {
  const out = new Set<string>();
  try {
    const { data } = await createAdminClient().from('users').select('phone').eq('is_platform_admin', true).eq('is_active', true).not('phone', 'is', null);
    for (const u of data ?? []) {
      const p = normalizePhone(u.phone);
      if (p) out.add(p);
    }
  } catch (e) {
    console.error('[retention-check] 플랫폼 관리자 조회 실패', e instanceof Error ? e.message : e);
  }
  return Array.from(out);
}

/**
 * Vercel Cron (매주 월 UTC 00:00 = KST 09:00): 보존기간 만료 예정 알림 (P35-B, SECURITY-POLICY R-8b 1단계).
 * - programs.ends_on + retention_years 가 30일 내 도래하거나 이미 지난 행사 중, retention_notice_sent_at 이 없거나 30일 이상 지난 행사에
 *   플랫폼 관리자 + 그 행사 privacy_officer(발주처 보호책임자·운영사 PL) 휴대폰으로 문자 1통 + 감사 `retention.notice`.
 * - **자동 파기는 하지 않는다** (사용자 결정 ⑦ 미정). 파기는 사람이 검토 후 별도 절차.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: programs, error } = await admin
    .from('programs')
    .select('id, name, ends_on, retention_years, privacy_officer, retention_notice_sent_at, status')
    .not('ends_on', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const horizon = now + NOTICE_BEFORE_DAYS * 86_400_000;
  const adminPhones = await platformAdminPhones();
  const notified: { programId: string; expiry: string; sent: number; recipients: number }[] = [];

  for (const p of programs ?? []) {
    const expiry = retentionExpiry(p.ends_on, p.retention_years);
    if (!expiry || expiry.getTime() > horizon) continue;
    const lastNotice = p.retention_notice_sent_at ? new Date(p.retention_notice_sent_at).getTime() : 0;
    if (lastNotice && now - lastNotice < RENOTIFY_DAYS * 86_400_000) continue;

    const officer = parsePrivacyOfficer(p.privacy_officer);
    const phones = new Set<string>(adminPhones);
    for (const o of [officer.client, officer.operator]) {
      const ph = normalizePhone(o?.phone ?? null);
      if (ph) phones.add(ph);
    }
    const expired = expiry.getTime() <= now;
    const text = [
      `[${PLATFORM_NAME}] 개인정보 보존기간 만료 ${expired ? '경과' : '예정'} — 파기 검토 필요`,
      `행사: ${p.name}`,
      `보존 만료일: ${fmtDate(expiry)} (종료 후 ${p.retention_years ?? DEFAULT_RETENTION_YEARS}년)`,
      '자동 파기는 되지 않습니다. 보호책임자·운영사 PL 이 파기 대상과 예외(정산 증빙)를 검토해 주세요.',
    ].join('\n');

    let sent = 0;
    for (const to of Array.from(phones)) {
      try {
        const r = await sendSms(to, text, p.id);
        if (r.ok) sent += 1;
        else console.error('[retention-check] 문자 실패', p.id, to.slice(-4), r.error);
      } catch (e) {
        console.error('[retention-check] 문자 예외', p.id, to.slice(-4), e instanceof Error ? e.message : e);
      }
    }

    const sentAt = new Date().toISOString();
    const { error: upError } = await admin.from('programs').update({ retention_notice_sent_at: sentAt }).eq('id', p.id);
    if (upError) console.error('[retention-check] retention_notice_sent_at 갱신 실패', p.id, upError.message);
    const { error: auditError } = await admin.from('audit_logs').insert({
      actor_id: null,
      program_id: p.id,
      action: 'retention.notice',
      entity_type: 'programs',
      entity_id: p.id,
      metadata: { expiry: fmtDate(expiry), expired, retention_years: p.retention_years, recipients: phones.size, sent, officer_client: !!officer.client?.phone, officer_operator: !!officer.operator?.phone },
    });
    // 감사 insert 오류는 삼키지 않는다 (§6-3)
    if (auditError) console.error('[retention-check] audit insert failed:', auditError.message);
    notified.push({ programId: p.id, expiry: fmtDate(expiry), sent, recipients: phones.size });
  }
  return NextResponse.json({ checked: programs?.length ?? 0, notified });
}
