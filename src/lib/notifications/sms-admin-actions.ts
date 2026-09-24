'use server';

import { requireStaff } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';

/** 운영사 담당 등급 권한(sms) — 발주처는 대상 아님 */
async function smsDenied(): Promise<string | null> {
  const profile = await requireStaff();
  if (profile.role !== 'nextlab') return null;
  const ctx = await contextOrNull(profile);
  return ctx ? denyUnless(ctx, 'sms') : null;
}
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/notifications/provider';
import { sendSolapiSms, getSolapiBalance } from '@/lib/notifications/solapi';
import {
  listReminderSettings,
  sendReminderForSetting,
  DEFAULT_MENTOR_REMINDER_TEMPLATE,
  type ReminderSendResult as ReminderRunResult,
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
  | ({ ok: true } & ReminderRunResult)
  | { ok: false; error: string };

/** 관리자: 문자 테스트 발송 */
export async function sendTestSmsAction(input: { to: string; text: string }): Promise<TestSmsResult> {
  await requireStaff();
  { const denied = await smsDenied(); if (denied) return { ok: false, error: denied }; }
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
  { const denied = await smsDenied(); if (denied) return { ok: false, error: denied }; }
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
  { const denied = await smsDenied(); if (denied) return { ok: false, error: denied }; }
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
  { const denied = await smsDenied(); if (denied) return { ok: false, error: denied }; }
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

/** 운영사 전용 게이트 — 리마인더 설정·발송은 운영사(sms 권한)만 */
async function reminderContext(): Promise<{ actorId: string; programId: string; groupIds: Set<string> } | { error: string }> {
  const profile = await requireStaff();
  if (profile.role !== 'nextlab') return { error: '운영사 담당자만 설정할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'sms');
  if (denied) return { error: denied };
  const { data: groups } = await createAdminClient().from('support_types').select('id').eq('program_id', ctx.programId);
  return { actorId: profile.id, programId: ctx.programId, groupIds: new Set((groups ?? []).map((g) => g.id)) };
}

export interface ReminderSettingInput {
  /** null = 행사 공통 */
  supportTypeId: string | null;
  enabled: boolean;
  weekday: number;
  sendHour: number;
  sendMinute: number;
  template: string;
}

/** 운영사: 리마인더 설정 저장 (행사 공통 또는 그룹 override) — 표현식 유니크라 select→update/insert */
export async function saveMentorReminderSettingAction(input: ReminderSettingInput): Promise<SimpleResult> {
  const c = await reminderContext();
  if ('error' in c) return { ok: false, error: c.error };
  const template = (input.template ?? '').trim();
  if (!template) return { ok: false, error: '안내문 내용을 입력하세요.' };
  if (template.length > 1000) return { ok: false, error: '안내문은 1,000자 이내로 입력하세요.' };
  const weekday = Number(input.weekday);
  const sendHour = Number(input.sendHour);
  const sendMinute = Number(input.sendMinute);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { ok: false, error: '요일이 올바르지 않습니다.' };
  if (!Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23) return { ok: false, error: '시각이 올바르지 않습니다.' };
  if (![0, 10, 20, 30, 40, 50].includes(sendMinute)) return { ok: false, error: '분은 10분 단위로 선택하세요.' };
  if (input.supportTypeId && !c.groupIds.has(input.supportTypeId)) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
  const admin = createAdminClient();
  let q = admin.from('mentor_reminder_settings').select('id').eq('program_id', c.programId);
  q = input.supportTypeId ? q.eq('support_type_id', input.supportTypeId) : q.is('support_type_id', null);
  const { data: existing } = await q.maybeSingle();
  const values = { enabled: !!input.enabled, weekday, send_hour: sendHour, send_minute: sendMinute, template, updated_by: c.actorId, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await admin.from('mentor_reminder_settings').update(values).eq('id', existing.id)
    : await admin.from('mentor_reminder_settings').insert({ program_id: c.programId, support_type_id: input.supportTypeId, ...values });
  if (error) return { ok: false, error: `저장 실패: ${error.message}` };
  const { error: auditErr } = await admin.from('audit_logs').insert({
    actor_id: c.actorId,
    action: 'sms.mentor_reminder_setting',
    entity_type: 'mentor_reminder_settings',
    entity_id: existing?.id ?? null,
    program_id: c.programId,
    metadata: { support_type_id: input.supportTypeId, enabled: !!input.enabled, weekday, send_hour: sendHour, send_minute: sendMinute },
  });
  if (auditErr) console.error('reminder setting audit failed:', auditErr.message);
  return { ok: true };
}

/** 운영사: 그룹 override 해제 → 그 그룹은 행사 공통 설정을 따른다 */
export async function clearMentorReminderGroupAction(supportTypeId: string): Promise<SimpleResult> {
  const c = await reminderContext();
  if ('error' in c) return { ok: false, error: c.error };
  if (!c.groupIds.has(supportTypeId)) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
  const admin = createAdminClient();
  const { error } = await admin.from('mentor_reminder_settings').delete().eq('program_id', c.programId).eq('support_type_id', supportTypeId);
  if (error) return { ok: false, error: `해제 실패: ${error.message}` };
  const { error: auditErr } = await admin.from('audit_logs').insert({ actor_id: c.actorId, action: 'sms.mentor_reminder_setting', entity_type: 'mentor_reminder_settings', entity_id: null, program_id: c.programId, metadata: { support_type_id: supportTypeId, cleared: true } });
  if (auditErr) console.error('reminder setting audit failed:', auditErr.message);
  return { ok: true };
}

/** 운영사: 해당 범위(행사 공통 또는 그룹) 리마인더 지금 발송 — 켜져 있는 설정만 */
export async function sendMentorReminderNowAction(supportTypeId: string | null): Promise<ReminderSendResult> {
  const c = await reminderContext();
  if ('error' in c) return { ok: false, error: c.error };
  const settings = await listReminderSettings(c.programId);
  const setting = settings.find((s) => s.supportTypeId === supportTypeId);
  if (!setting) return { ok: false, error: '먼저 설정을 저장하세요.' };
  const result = await sendReminderForSetting(setting, settings, c.actorId);
  return { ok: true, ...result };
}

/** 기본 문구 (화면의 [기본 문구로] 버튼) */
export async function defaultMentorReminderTemplateAction(): Promise<string> {
  return DEFAULT_MENTOR_REMINDER_TEMPLATE;
}
