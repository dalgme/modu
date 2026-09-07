import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendAlimtalk, sendSms, alimtalkConfigured } from '@/lib/notifications/provider';
import { templateFor } from '@/lib/notifications/templates';

export interface DispatchSummary {
  processed: number;
  sent: number;
  fallback: number;
  failed: number;
  skipped: number;
}

/**
 * pending 알림을 발송한다.
 *  - 알림톡 시도 → 실패 시 SMS 자동 대체발송(fallback)
 *  - 결과를 notifications 에 채널·상태·시각·에러로 기록 (통보 누락 분쟁 대비)
 *  - 대행사 미설정 시 발송 보류(pending 유지)하여 계약 후 재발송 가능
 *  - approved 통보 완료 시 케이스 approved → notified 전이 (워크플로우 9단계)
 */
export async function dispatchPending(limit = 100): Promise<DispatchSummary> {
  const admin = createAdminClient();
  const summary: DispatchSummary = { processed: 0, sent: 0, fallback: 0, failed: 0, skipped: 0 };

  if (!alimtalkConfigured()) {
    // 발송 채널 미설정 — 보류 (pending 유지)
    return summary;
  }

  const { data: pending } = await admin
    .from('notifications')
    .select('id, case_id, recipient_id, recipient_phone, trigger_event, template_code')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  for (const n of pending ?? []) {
    summary.processed += 1;

    // 수신 전화번호 확인
    let phone = n.recipient_phone;
    if (!phone && n.recipient_id) {
      const { data: user } = await admin
        .from('users')
        .select('phone')
        .eq('id', n.recipient_id)
        .maybeSingle();
      phone = user?.phone ?? null;
    }
    if (!phone) {
      await admin
        .from('notifications')
        .update({ status: 'failed', error_message: 'no_phone', sent_at: null })
        .eq('id', n.id);
      summary.failed += 1;
      continue;
    }

    const tpl = templateFor(n.trigger_event);
    const now = new Date().toISOString();

    // 1) 알림톡
    const alim = await sendAlimtalk(phone, n.template_code ?? tpl.code, tpl.text);
    if (alim.ok) {
      await admin
        .from('notifications')
        .update({ channel: 'alimtalk', status: 'sent', sent_at: now, error_message: null })
        .eq('id', n.id);
      summary.sent += 1;
      await maybeMarkNotified(admin, n.case_id, n.trigger_event);
      continue;
    }

    // 2) SMS 대체발송
    const sms = await sendSms(phone, tpl.text);
    if (sms.ok) {
      await admin
        .from('notifications')
        .update({
          channel: 'sms',
          status: 'fallback_sent',
          sent_at: now,
          error_message: `alimtalk_failed:${alim.error}`,
        })
        .eq('id', n.id);
      summary.fallback += 1;
      await maybeMarkNotified(admin, n.case_id, n.trigger_event);
      continue;
    }

    // 둘 다 실패 — 로그만 남기고 실패 처리
    await admin
      .from('notifications')
      .update({ status: 'failed', error_message: `alimtalk:${alim.error};sms:${sms.error}` })
      .eq('id', n.id);
    summary.failed += 1;
  }

  return summary;
}

/** approved 통보를 발송하면 케이스를 approved → notified 로 전이 (자동 통보 완료) */
async function maybeMarkNotified(
  admin: ReturnType<typeof createAdminClient>,
  caseId: string | null,
  triggerEvent: string,
): Promise<void> {
  if (!caseId || triggerEvent !== 'approved') return;
  const { data: updated } = await admin
    .from('cases')
    .update({ status: 'notified' })
    .eq('id', caseId)
    .eq('status', 'approved')
    .select('id');
  if (updated && updated.length > 0) {
    await admin.from('case_status_history').insert({
      case_id: caseId,
      from_status: 'approved',
      to_status: 'notified',
      changed_by: null,
      note: '승인 자동 통보 완료',
    });
  }
}

/**
 * 진흥원 승인 대기(reviewed) 3일 초과 케이스에 독촉 알림 큐 등록.
 * (Vercel Cron 등에서 주기 실행)
 */
export async function queueOverdueReminders(): Promise<{ queued: number }> {
  const admin = createAdminClient();
  const threshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: overdue } = await admin
    .from('cases')
    .select('id, updated_at')
    .eq('status', 'reviewed')
    .lt('updated_at', threshold);

  if (!overdue || overdue.length === 0) return { queued: 0 };

  const { data: institutions } = await admin.from('users').select('id').eq('role', 'institution');
  let queued = 0;
  for (const c of overdue) {
    for (const u of institutions ?? []) {
      // 중복 방지: 이미 오늘 독촉 큐가 있으면 skip
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('case_id', c.id)
        .eq('recipient_id', u.id)
        .eq('trigger_event', 'approval_overdue')
        .eq('status', 'pending');
      if ((count ?? 0) > 0) continue;
      await admin.from('notifications').insert({
        case_id: c.id,
        recipient_id: u.id,
        channel: 'alimtalk',
        trigger_event: 'approval_overdue',
        status: 'pending',
      });
      queued += 1;
    }
  }
  return { queued };
}
