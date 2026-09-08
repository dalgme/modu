import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendAlimtalk, sendSms, alimtalkConfigured } from '@/lib/notifications/provider';
import { templateFor } from '@/lib/notifications/templates';
import { getBranding } from '@/lib/programs/data';
import { fmt } from '@/lib/programs/branding';

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
    .select('id, case_id, program_id, recipient_id, recipient_phone, trigger_event, template_code, payload')
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

    // 행사 범위: notifications.program_id → 없으면 케이스의 행사. 문구의 {program}/{operator} 치환 + 행사별 문자 API.
    let programId: string | null = n.program_id;
    if (!programId && n.case_id) {
      const { data: c } = await admin.from('cases').select('program_id').eq('id', n.case_id).maybeSingle();
      programId = c?.program_id ?? null;
    }
    const branding = await getBranding(programId);
    const rawTpl = templateFor(n.trigger_event);
    const extra = payloadMessage(n.payload);
    const tpl = { code: rawTpl.code, text: fmt(rawTpl.text, branding) + (extra ? ` ${extra}` : '') + (branding.smsFooter ? ` ${branding.smsFooter}` : '') };
    const now = new Date().toISOString();

    // 1) 알림톡
    const alim = await sendAlimtalk(phone, n.template_code ?? tpl.code, tpl.text);
    if (alim.ok) {
      await admin
        .from('notifications')
        .update({ channel: 'alimtalk', status: 'sent', sent_at: now, error_message: null })
        .eq('id', n.id);
      summary.sent += 1;
      continue;
    }

    // 2) SMS 대체발송
    const sms = await sendSms(phone, tpl.text, programId);
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

/**
 * 종결 요청(closure_requested) 후 3일 넘게 검수되지 않은 케이스 → 그 행사의 운영사 담당자에게 독촉 알림 큐.
 * (Vercel Cron 에서 주기 실행. 같은 날 이미 큐가 있으면 건너뛴다)
 */
export async function queueOverdueReminders(): Promise<{ queued: number }> {
  const admin = createAdminClient();
  const threshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: overdue } = await admin
    .from('cases')
    .select('id, program_id, updated_at')
    .eq('status', 'closure_requested')
    .lt('updated_at', threshold);
  if (!overdue || overdue.length === 0) return { queued: 0 };

  const programIds = Array.from(new Set(overdue.map((c) => c.program_id)));
  const { data: members } = await admin
    .from('program_members')
    .select('program_id, user_id, users!inner(is_active)')
    .in('program_id', programIds)
    .eq('role', 'nextlab')
    .eq('is_active', true);
  const staffByProgram = new Map<string, string[]>();
  for (const m of members ?? []) {
    const u = m.users as unknown as { is_active: boolean } | null;
    if (!u || !u.is_active) continue;
    const list = staffByProgram.get(m.program_id) ?? [];
    list.push(m.user_id);
    staffByProgram.set(m.program_id, list);
  }

  let queued = 0;
  for (const c of overdue) {
    for (const uid of staffByProgram.get(c.program_id) ?? []) {
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('case_id', c.id)
        .eq('recipient_id', uid)
        .eq('trigger_event', 'closure_overdue')
        .eq('status', 'pending');
      if ((count ?? 0) > 0) continue;
      await admin.from('notifications').insert({
        case_id: c.id,
        program_id: c.program_id,
        recipient_id: uid,
        channel: 'alimtalk',
        trigger_event: 'closure_overdue',
        status: 'pending',
      });
      queued += 1;
    }
  }
  return { queued };
}

/** payload.message — 정산 금액 등 건별 문구를 템플릿 뒤에 덧붙인다 (기관명 리터럴 없음) */
function payloadMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const m = (payload as Record<string, unknown>).message;
  return typeof m === 'string' && m.trim() ? m.trim() : null;
}
