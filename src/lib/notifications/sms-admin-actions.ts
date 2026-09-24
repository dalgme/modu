'use server';

import { requireStaff } from '@/lib/auth/guards';
import { contextOrNull, type ProgramContext } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/notifications/provider';
import { getSolapiBalance } from '@/lib/notifications/solapi';
import { fetchAllIn } from '@/lib/supabase/paginate';

const INSTITUTION_READ_ONLY = '발주처 계정은 문자 발송을 할 수 없습니다.';

/**
 * 문자 발송 게이트 (2026-09-24):
 *  - 운영사: 담당 등급 권한 `sms` (옵저버 차단)
 *  - 발주처: 기본 열람 전용. 행사 설정 staff_permissions.institution_sms === true 일 때만 발송 가능
 * 반환: 컨텍스트(행사 범위) 또는 오류 문구
 */
async function smsGate(): Promise<{ ok: true; ctx: ProgramContext; actorId: string } | { ok: false; error: string }> {
  const profile = await requireStaff();
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  if (ctx.role === 'institution') {
    const perms = ctx.program.staff_permissions;
    const allowed = !!perms && typeof perms === 'object' && !Array.isArray(perms) && (perms as Record<string, unknown>).institution_sms === true;
    if (!allowed) return { ok: false, error: INSTITUTION_READ_ONLY };
    return { ok: true, ctx, actorId: profile.id };
  }
  const denied = denyUnless(ctx, 'sms');
  if (denied) return { ok: false, error: denied };
  return { ok: true, ctx, actorId: profile.id };
}

/** 수신자 id 를 현재 행사의 활성 소속(program_members)으로 제한 — 다른 행사 회원은 조용히 제외 */
async function scopeRecipients(programId: string, ids: string[]): Promise<string[]> {
  const rows = await fetchAllIn(ids, (chunk, from, to) =>
    createAdminClient().from('program_members').select('user_id').eq('program_id', programId).eq('is_active', true).in('user_id', chunk).range(from, to),
  );
  const ok = new Set(rows.map((r) => r.user_id));
  return ids.filter((id) => ok.has(id));
}

/** 발송사 응답이 인증·잔액 오류면 나머지 발송을 멈춘다 (전부 같은 이유로 실패하므로) */
function isFatalProviderError(msg: string): boolean {
  const m = msg.toLowerCase();
  return ['balance', '잔액', '401', '403', 'auth', 'not_configured', 'credentials_unavailable', 'sender_missing'].some((k) => m.includes(k));
}
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

/** 관리자: 문자 테스트 발송 (행사별 문자 API → 플랫폼 폴백) */
export async function sendTestSmsAction(input: { to: string; text: string }): Promise<TestSmsResult> {
  const g = await smsGate();
  if (!g.ok) return { ok: false, error: g.error };
  const to = (input.to ?? '').trim();
  const text = (input.text ?? '').trim();
  if (!/^01[0-9]{7,9}$/.test(to.replace(/[^0-9]/g, ''))) {
    return { ok: false, error: '올바른 휴대폰 번호를 입력하세요.' };
  }
  if (text.length < 1) return { ok: false, error: '메시지 내용을 입력하세요.' };
  return sendSms(to, text, g.ctx.programId);
}

/**
 * 관리자: 선택한 회원들에게 실제 문자 발송.
 *  - 수신자는 현재 행사의 활성 소속으로 제한
 *  - 행사별 문자 API → 플랫폼 폴백 (`sendSms(to, text, programId)`)
 *  - 10명 단위 병렬 배치(Promise.allSettled). 발송사가 인증·잔액 오류를 돌려주면 그 배치에서 중단
 *  - 감사 'sms.bulk_send' (program_id, total/count, sent, failed, failed_ids)
 */
export async function sendBulkSmsAction(input: {
  recipientIds: string[];
  text: string;
  senderIndex?: 1 | 2;
}): Promise<BulkSmsResult> {
  const g = await smsGate();
  if (!g.ok) return { ok: false, error: g.error };
  const text = (input.text ?? '').trim();
  const rawIds = Array.from(new Set(input.recipientIds ?? [])).filter(Boolean);
  if (!text) return { ok: false, error: '메시지 내용을 입력하세요.' };
  if (rawIds.length === 0) return { ok: false, error: '수신자를 1명 이상 선택하세요.' };
  const ids = await scopeRecipients(g.ctx.programId, rawIds);
  if (ids.length === 0) return { ok: false, error: '이 행사 소속 회원이 아닙니다.' };

  const admin = createAdminClient();
  const users = await fetchAllIn(ids, (chunk, from, to) => admin.from('users').select('id, phone, is_active').in('id', chunk).range(from, to));
  const targets = users
    .filter((u) => u.is_active && (u.phone ?? '').replace(/\D/g, '').length >= 10)
    .map((u) => ({ id: u.id, phone: u.phone as string }));
  if (targets.length === 0) return { ok: false, error: '발송 가능한 연락처가 없습니다.' };

  let sent = 0;
  let failed = 0;
  const failedIds: string[] = [];
  let fatal: string | null = null;
  let attempted = 0;
  const BATCH = 10;
  for (let i = 0; i < targets.length && !fatal; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map((t) => sendSms(t.phone, text, g.ctx.programId)));
    attempted += batch.length;
    results.forEach((r, idx) => {
      const id = batch[idx]!.id;
      if (r.status === 'fulfilled' && r.value.ok) sent += 1;
      else {
        failed += 1;
        failedIds.push(id);
        const msg = r.status === 'fulfilled' ? (r.value.ok ? '' : r.value.error) : r.reason instanceof Error ? r.reason.message : String(r.reason);
        if (!fatal && isFatalProviderError(msg)) fatal = msg;
      }
    });
  }
  // 발송사 오류로 중단된 경우 시도하지 못한 수신자도 실패로 집계
  for (const t of targets.slice(attempted)) {
    failed += 1;
    failedIds.push(t.id);
  }

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: g.actorId,
    program_id: g.ctx.programId,
    action: 'sms.bulk_send',
    entity_type: 'users',
    entity_id: g.actorId,
    metadata: { total: targets.length, count: targets.length, sent, failed, failed_ids: failedIds.slice(0, 200), dropped_out_of_scope: rawIds.length - ids.length, fatal_error: fatal, role: g.ctx.role },
  });
  if (auditError) console.error('bulk sms audit failed:', auditError.message);

  if (fatal) {
    return { ok: false, error: `발송사 오류로 중단했습니다 (${sent}건 발송 · ${failed}건 미발송): ${fatal}. 문자 API 자격증명·잔액을 확인하세요.` };
  }
  if (sent === 0) {
    return { ok: false, error: `발송에 모두 실패했습니다. (${failed}건)` };
  }
  return { ok: true, sent, failed, total: targets.length };
}

/** 관리자: 문자 잔액 조회 (플랫폼 계정) */
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
  const g = await smsGate();
  if (!g.ok) return { ok: false, error: g.error };
  const actor = { id: g.actorId };
  const text = (input.text ?? '').trim();
  const rawIds = Array.from(new Set(input.recipientIds ?? [])).filter(Boolean);
  if (!text) return { ok: false, error: '메시지 내용을 입력하세요.' };
  if (rawIds.length === 0) return { ok: false, error: '수신자를 1명 이상 선택하세요.' };
  const ids = await scopeRecipients(g.ctx.programId, rawIds);
  if (ids.length === 0) return { ok: false, error: '이 행사 소속 회원이 아닙니다.' };

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
    program_id: g.ctx.programId,
  } as never);
  if (error) return { ok: false, error: error.message };

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: actor.id,
    program_id: g.ctx.programId,
    action: 'sms.schedule',
    entity_type: 'scheduled_messages',
    entity_id: actor.id,
    metadata: { total: ids.length, scheduled_at: when.toISOString(), dropped_out_of_scope: rawIds.length - ids.length },
  });
  if (auditError) console.error('sms schedule audit failed:', auditError.message);

  return { ok: true, scheduledAt: when.toISOString(), total: ids.length };
}

/** 관리자: 예약 발송 취소 (pending · 이 행사의 예약만) */
export async function cancelScheduledSmsAction(id: string): Promise<SimpleResult> {
  const g = await smsGate();
  if (!g.ok) return { ok: false, error: g.error };
  if (!id) return { ok: false, error: '잘못된 요청입니다.' };
  const admin = createAdminClient();
  const { data: row } = await admin.from('scheduled_messages').select('id, program_id').eq('id', id).maybeSingle();
  const rowProgram = (row as unknown as { program_id?: string | null } | null)?.program_id ?? null;
  if (!row || (rowProgram && rowProgram !== g.ctx.programId)) return { ok: false, error: '이 행사의 예약이 아닙니다.' };
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
  const { error: auditError } = await admin.from('audit_logs').insert({ actor_id: g.actorId, program_id: g.ctx.programId, action: 'sms.schedule_cancel', entity_type: 'scheduled_messages', entity_id: id, metadata: {} });
  if (auditError) console.error('sms cancel audit failed:', auditError.message);
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
