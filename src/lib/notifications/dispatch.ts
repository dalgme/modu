import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendAlimtalk, sendSms, alimtalkConfigured } from '@/lib/notifications/provider';
import { notifyProgramStaff } from '@/lib/workflow/closure';
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

  // 알림톡 대행사가 없으면 SMS 로 바로 보낸다 — 예전에는 pending 으로 영구 보류돼 멘토가 정산 확정·보완 요청을 받지 못했다 (P30)
  const alimtalkOn = alimtalkConfigured();

  const { data: pending } = await admin
    .from('notifications')
    .select('id, case_id, program_id, recipient_id, recipient_phone, trigger_event, template_code, payload')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  for (const n of pending ?? []) {
    summary.processed += 1;

    // 멘티 서명 요청(round_registered): 발송 직전에 이미 서명됐으면 건너뛴다 — 현장 서명·대행 후 뒤늦게 문자가 가는 것을 막는다 (P31)
    if (n.trigger_event === 'round_registered' && (await roundAlreadySigned(n.case_id, n.payload))) {
      await admin.from('notifications').update({ status: 'failed', error_message: 'skipped:already_signed', sent_at: null }).eq('id', n.id);
      summary.skipped += 1;
      continue;
    }

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

    // 1) 알림톡 (설정된 경우만)
    const alim = alimtalkOn ? await sendAlimtalk(phone, n.template_code ?? tpl.code, tpl.text) : { ok: false as const, error: 'alimtalk_not_configured' };
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
 * (Vercel Cron 에서 주기 실행)
 * (P31) 대기 시간은 cases.updated_at(다른 수정으로 갱신됨)이 아니라 case_status_history 의 closure_requested 전이 시각 기준.
 *       같은 케이스에 최근 7일 안에 이 이벤트 알림이 (상태 무관) 있으면 다시 보내지 않는다.
 *       수신자는 notifyProgramStaff('closure_overdue' → 'review' 권한, 담당 그룹) — 옵저버·담당 외 그룹 담당자는 제외.
 */
export async function queueOverdueReminders(): Promise<{ queued: number }> {
  const admin = createAdminClient();
  const threshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const repeatWindow = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: waiting } = await admin.from('cases').select('id, program_id').eq('status', 'closure_requested');
  if (!waiting || waiting.length === 0) return { queued: 0 };

  let queued = 0;
  for (const c of waiting) {
    // 마지막 closure_requested 전이 시각
    const { data: hist } = await admin
      .from('case_status_history')
      .select('created_at')
      .eq('case_id', c.id)
      .eq('to_status', 'closure_requested')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const requestedAt = hist?.created_at ?? null;
    if (!requestedAt || requestedAt > threshold) continue;

    // 최근 7일 내 같은 케이스에 보낸(또는 큐된) 독촉이 있으면 건너뛴다 — 상태 무관
    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('case_id', c.id)
      .eq('trigger_event', 'closure_overdue')
      .gte('created_at', repeatWindow);
    if ((count ?? 0) > 0) continue;

    const before = await countNotifications(admin, c.id, 'closure_overdue');
    await notifyProgramStaff(c.program_id, c.id, 'closure_overdue');
    const after = await countNotifications(admin, c.id, 'closure_overdue');
    queued += Math.max(0, after - before);
  }
  return { queued };
}

async function countNotifications(admin: ReturnType<typeof createAdminClient>, caseId: string, event: string): Promise<number> {
  const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('case_id', caseId).eq('trigger_event', event);
  return count ?? 0;
}

/** round_registered 알림의 대상 회차가 이미 멘티 서명됐는지 (payload.log_id 우선, 없으면 케이스에 미서명 보고서 회차가 하나도 없을 때) */
async function roundAlreadySigned(caseId: string | null, payload: unknown): Promise<boolean> {
  const admin = createAdminClient();
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const logId = typeof p.log_id === 'string' ? p.log_id : null;
  if (logId) {
    const { data: log } = await admin.from('mentoring_logs').select('mentee_signed_at').eq('id', logId).maybeSingle();
    return !log || !!log.mentee_signed_at;
  }
  if (!caseId) return false;
  const { count } = await admin
    .from('mentoring_logs')
    .select('id', { count: 'exact', head: true })
    .eq('case_id', caseId)
    .not('report_registered_at', 'is', null)
    .is('mentee_signed_at', null);
  return (count ?? 0) === 0;
}

/** payload.message — 정산 금액 등 건별 문구를 템플릿 뒤에 덧붙인다 (기관명 리터럴 없음) */
function payloadMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const m = (payload as Record<string, unknown>).message;
  return typeof m === 'string' && m.trim() ? m.trim() : null;
}
