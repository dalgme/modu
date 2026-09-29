import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendSolapiSms, solapiConfigured } from '@/lib/notifications/solapi';
import { loadLoginGuideRecipients } from '@/lib/data/members';
import type { LoginGuideContext, LoginGuideRecipient } from '@/lib/sms/login-guide-template';
import { fallbackBulkRecipient, renderBulkSms, usesBulkFields } from '@/lib/sms/bulk-sms-fields';

export interface ScheduledDispatchSummary {
  processed: number;
  sent: number;
  failed: number;
}

/**
 * 예약 시각이 도달한 예약 문자(scheduled_messages, status=pending)를 발송한다.
 * cron(5분 주기)에서 호출 — 예약시각 ≤ 현재 인 건을 수신자별로 순차 발송하고 결과를 기록한다.
 * 발송 성공이 1건이라도 있으면 'sent', 전부 실패면 'failed' 로 마감한다.
 * 문구에 자동 기입 필드(`{name}` `{program}` … — src/lib/sms/bulk-sms-fields.ts)가 있으면
 * 즉시 발송과 같은 로더·렌더 함수로 **발송 시점 데이터 기준** 수신자별 치환한다.
 * (행사 정보가 없는 옛 예약은 `{name}` 만 치환)
 */
export async function dispatchScheduledMessages(limit = 20): Promise<ScheduledDispatchSummary> {
  const summary: ScheduledDispatchSummary = { processed: 0, sent: 0, failed: 0 };
  if (!solapiConfigured()) return summary;

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due } = await admin
    .from('scheduled_messages')
    .select('id, text, sender_index, recipient_ids, program_id')
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
        .select('id, name, phone, email, organization, role, is_active')
        .in('id', ids);
      const targets = (users ?? []).filter((u) => u.is_active && (u.phone ?? '').replace(/\D/g, '').length >= 10);

      const textFor = await buildScheduledRenderer(job.text, job.program_id, targets.map((u) => u.id));
      const senderIndex = job.sender_index === 2 ? 2 : 1;
      for (const u of targets) {
        const r = await sendSolapiSms(u.phone as string, textFor(u), { senderIndex });
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

type ScheduledTarget = { id: string; name: string; phone: string | null; email: string | null; organization: string | null; role: LoginGuideRecipient['role'] };

/**
 * 예약 문구 → 수신자별 본문 함수. 필드가 없으면 문구 그대로.
 * 행사 정보가 없는 예약(program_id null)은 `{name}` 만 치환한다.
 */
async function buildScheduledRenderer(text: string, programId: string | null, ids: string[]): Promise<(u: ScheduledTarget) => string> {
  if (!usesBulkFields(text)) return () => text;
  if (!programId) return (u) => text.replaceAll('{name}', u.name);
  const { program, recipients } = await loadLoginGuideRecipients(programId, null, ids);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const context: LoginGuideContext = { programName: program?.name ?? '', loginUrl: base ? `${base}/login` : '', footer: program?.footer ?? null };
  const byId = new Map(recipients.map((r) => [r.id, r]));
  return (u) => renderBulkSms(text, byId.get(u.id) ?? fallbackBulkRecipient(u), context);
}
