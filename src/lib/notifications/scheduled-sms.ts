import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendSolapiSms, solapiConfigured } from '@/lib/notifications/solapi';

export interface ScheduledDispatchSummary {
  processed: number;
  sent: number;
  failed: number;
}

/**
 * 예약 시각이 도달한 예약 문자(scheduled_messages, status=pending)를 발송한다.
 * cron(5분 주기)에서 호출 — 예약시각 ≤ 현재 인 건을 수신자별로 순차 발송하고 결과를 기록한다.
 * 발송 성공이 1건이라도 있으면 'sent', 전부 실패면 'failed' 로 마감한다.
 */
export async function dispatchScheduledMessages(limit = 20): Promise<ScheduledDispatchSummary> {
  const summary: ScheduledDispatchSummary = { processed: 0, sent: 0, failed: 0 };
  if (!solapiConfigured()) return summary;

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due } = await admin
    .from('scheduled_messages')
    .select('id, text, sender_index, recipient_ids')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  for (const job of due ?? []) {
    summary.processed += 1;

    // 발송 시점 기준 최신 연락처 조회 (활성 회원만)
    const ids = (job.recipient_ids ?? []).filter(Boolean);
    let sent = 0;
    let failed = 0;
    if (ids.length > 0) {
      const { data: users } = await admin
        .from('users')
        .select('id, phone, is_active')
        .in('id', ids);
      const phones = (users ?? [])
        .filter((u) => u.is_active && (u.phone ?? '').replace(/\D/g, '').length >= 10)
        .map((u) => u.phone as string);

      const senderIndex = job.sender_index === 2 ? 2 : 1;
      for (const phone of phones) {
        const r = await sendSolapiSms(phone, job.text, { senderIndex });
        if (r.ok) sent += 1;
        else failed += 1;
      }
    }

    const status = sent > 0 ? 'sent' : 'failed';
    await admin
      .from('scheduled_messages')
      .update({
        status,
        sent_count: sent,
        failed_count: failed,
        dispatched_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'pending'); // 동시 실행 중복 발송 방지

    summary.sent += sent;
    summary.failed += failed;
  }

  return summary;
}
