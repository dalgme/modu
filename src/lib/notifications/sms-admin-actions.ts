'use server';

import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/notifications/provider';
import { sendSolapiSms, getSolapiBalance } from '@/lib/notifications/solapi';
import {
  saveMentorReminderConfig,
  type MentorReminderConfig,
} from '@/lib/data/app-settings';
import {
  sendMentorWeeklyReminders,
  type WeeklyReminderResult,
} from '@/lib/notifications/mentor-weekly-reminder';

export type TestSmsResult = { ok: true; providerId?: string } | { ok: false; error: string };

export type BulkSmsResult =
  | { ok: true; sent: number; failed: number; total: number }
  | { ok: false; error: string };
export type BalanceResult =
  | { ok: true; balance: number; point: number }
  | { ok: false; error: string };
export type ScheduleSmsResult =
  | { ok: true; scheduledAt: string; total: number }
  | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };
export type ReminderSendResult =
  | ({ ok: true } & WeeklyReminderResult)
  | { ok: false; error: string };

/** 관리자: 문자 테스트 발송 */
export async function sendTestSmsAction(input: { to: string; text: string }): Promise<TestSmsResult> {
  await requireStaff();
  const to = (input.to ?? '').trim();
  const text = (input.text ?? '').trim();
  if (!/^01[0-9]{7,9}$/.test(to.replace(/[^0-9]/g, ''))) {
    return { ok: false, error: '올바른 휴대폰 번호를 입력하세요.' };
  }
  if (text.length < 1) return { ok: false, error: '메시지 내용을 입력하세요.' };
  return sendSms(to, text);
}

/**
 * 관리자: 선택한 회원들에게 실제 문자 발송.
 * 수신자 id 목록으로 연락처를 조회해 순차 발송하고, 성공/실패 수를 집계한다.
 */
export async function sendBulkSmsAction(input: {
  recipientIds: string[];
  text: string;
  senderIndex?: 1 | 2;
}): Promise<BulkSmsResult> {
  const actor = await requireStaff();
  const text = (input.text ?? '').trim();
  const ids = Array.from(new Set(input.recipientIds ?? [])).filter(Boolean);
  if (!text) return { ok: false, error: '메시지 내용을 입력하세요.' };
  if (ids.length === 0) return { ok: false, error: '수신자를 1명 이상 선택하세요.' };

  const admin = createAdminClient();
  const { data: users } = await admin
    .from('users')
    .select('id, phone, is_active')
    .in('id', ids);
  const phones = (users ?? [])
    .filter((u) => u.is_active && (u.phone ?? '').replace(/\D/g, '').length >= 10)
    .map((u) => u.phone as string);
  if (phones.length === 0) return { ok: false, error: '발송 가능한 연락처가 없습니다.' };

  let sent = 0;
  let failed = 0;
  for (const phone of phones) {
    const r = await sendSolapiSms(phone, text, { senderIndex: input.senderIndex ?? 1 });
    if (r.ok) sent += 1;
    else failed += 1;
  }

  await admin.from('audit_logs').insert({
    actor_id: actor.id,
    action: 'sms.bulk_send',
    entity_type: 'users',
    entity_id: actor.id,
    metadata: { total: phones.length, sent, failed },
  });

  if (sent === 0) {
    return { ok: false, error: `발송에 모두 실패했습니다. (${failed}건)` };
  }
  return { ok: true, sent, failed, total: phones.length };
}

/** 관리자: 문자 잔액 조회 */
export async function getSmsBalanceAction(): Promise<BalanceResult> {
  await requireStaff();
  return getSolapiBalance();
}

/**
 * 관리자: 선택 회원들에게 예약 발송 등록.
 * 예약시각을 저장해두면 cron(5분 주기)이 예약시각 도달 시 최신 연락처로 발송한다.
 */
export async function scheduleBulkSmsAction(input: {
  recipientIds: string[];
  text: string;
  scheduledAt: string;
  senderIndex?: 1 | 2;
}): Promise<ScheduleSmsResult> {
  const actor = await requireStaff();
  const text = (input.text ?? '').trim();
  const ids = Array.from(new Set(input.recipientIds ?? [])).filter(Boolean);
  if (!text) return { ok: false, error: '메시지 내용을 입력하세요.' };
  if (ids.length === 0) return { ok: false, error: '수신자를 1명 이상 선택하세요.' };

  const when = new Date(input.scheduledAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: '예약 일시가 올바르지 않습니다.' };
  // 최소 2분 뒤(현재 시각 이후)만 허용
  if (when.getTime() < Date.now() + 60_000) {
    return { ok: false, error: '예약 일시는 현재보다 이후여야 합니다.' };
  }

  const admin = createAdminClient();
  const { error } = await admin.from('scheduled_messages').insert({
    text,
    sender_index: input.senderIndex ?? 1,
    recipient_ids: ids,
    recipient_count: ids.length,
    scheduled_at: when.toISOString(),
    status: 'pending',
    created_by: actor.id,
  });
  if (error) return { ok: false, error: error.message };

  await admin.from('audit_logs').insert({
    actor_id: actor.id,
    action: 'sms.schedule',
    entity_type: 'scheduled_messages',
    entity_id: actor.id,
    metadata: { total: ids.length, scheduled_at: when.toISOString() },
  });

  return { ok: true, scheduledAt: when.toISOString(), total: ids.length };
}

/** 관리자: 예약 발송 취소 (pending 만 취소 가능) */
export async function cancelScheduledSmsAction(id: string): Promise<SimpleResult> {
  await requireStaff();
  if (!id) return { ok: false, error: '잘못된 요청입니다.' };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('scheduled_messages')
    .update({ status: 'canceled' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: '이미 발송되었거나 취소할 수 없는 예약입니다.' };
  }
  return { ok: true };
}

/** 관리자: 주간 멘토 안내문 문구·활성 여부 저장 */
export async function saveMentorReminderAction(input: MentorReminderConfig): Promise<SimpleResult> {
  const actor = await requireStaff();
  const template = (input.template ?? '').trim();
  if (!template) return { ok: false, error: '안내문 내용을 입력하세요.' };
  await saveMentorReminderConfig({ template, enabled: !!input.enabled }, actor.id);
  return { ok: true };
}

/** 관리자: 주간 멘토 안내문 지금 즉시 발송(수동 트리거·테스트) */
export async function sendMentorReminderNowAction(): Promise<ReminderSendResult> {
  await requireStaff();
  const result = await sendMentorWeeklyReminders();
  return { ok: true, ...result };
}
