import 'server-only';

import { randomUUID } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { resolveSmsCredentials } from '@/lib/sms/secrets';
import { listSolapiMessages, sendSolapiMany } from '@/lib/notifications/solapi';
import { classifySolapiStatus, countStatuses, type SmsBatchCounts } from '@/lib/sms/send-status';

/**
 * 문자 일괄 발송 기록·결과 추적 (2026-11-03, 0096).
 * 일괄 발송 = 솔라피 send-many 1회 호출(500건 단위) → 수신자별 접수 결과를 sms_send_items 에 남기고,
 * [발송 현황]에서 솔라피 메시지 조회로 수신 완료·실패 사유를 채운다(syncSmsBatch).
 */

export interface TrackedItemInput {
  userId: string | null;
  name: string;
  phone: string;
  text: string;
}

export type TrackedSendResult =
  | { ok: true; batchId: string; total: number; accepted: number; rejected: number; rejectedItems: { userId: string | null; name: string; phone: string; reason: string | null }[] }
  | { ok: false; error: string };

export async function sendTracked(input: {
  programId: string;
  /** 실행자 (예약 문자 자동 발송은 예약한 사람, 없으면 null) */
  actorId: string | null;
  kind: 'bulk' | 'login_guide' | 'retry';
  title?: string | null;
  template: string;
  items: TrackedItemInput[];
  parentBatchId?: string | null;
}): Promise<TrackedSendResult> {
  if (input.items.length === 0) return { ok: false, error: '보낼 대상이 없습니다.' };
  const creds = await resolveSmsCredentials(input.programId, 'send');
  if (!creds) return { ok: false, error: '문자 API 가 설정되지 않았거나 자격증명을 읽을 수 없습니다. 운영 설정 > 문자 API 를 확인하세요.' };

  const admin = createAdminClient();
  const { data: batch, error: bErr } = await admin
    .from('sms_send_batches')
    .insert({ program_id: input.programId, created_by: input.actorId, kind: input.kind, title: input.title ?? null, text_template: input.template, parent_batch_id: input.parentBatchId ?? null, credential_source: creds.source, total: input.items.length })
    .select('id')
    .single();
  if (bErr || !batch) return { ok: false, error: `발송 기록을 만들지 못했습니다: ${bErr?.message ?? 'unknown'}` };

  const withIds = input.items.map((it) => ({ ...it, id: randomUUID() }));
  const results = await sendSolapiMany(
    withIds.map((it) => ({ ref: it.id, to: it.phone, text: it.text })),
    { apiKey: creds.apiKey, apiSecret: creds.apiSecret, senderNumber: creds.senderNumber },
  );
  const byRef = new Map(results.map((r) => [r.ref, r]));
  const now = new Date().toISOString();
  const rows = withIds.map((it) => {
    const r = byRef.get(it.id);
    return {
      id: it.id,
      batch_id: batch.id,
      program_id: input.programId,
      user_id: it.userId,
      name: it.name,
      phone: it.phone,
      text: it.text,
      status: r?.accepted ? 'pending' : 'rejected',
      provider_message_id: r?.messageId ?? null,
      provider_group_id: r?.groupId ?? null,
      status_code: r?.statusCode ?? null,
      reason: r?.accepted ? null : (r?.reason ?? '응답 없음'),
      created_at: now,
      updated_at: now,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from('sms_send_items').insert(rows.slice(i, i + 500));
    if (error) console.error('[sms] send items insert failed:', error.message);
  }
  const groupIds = Array.from(new Set(results.map((r) => r.groupId).filter((g): g is string => !!g)));
  await admin.from('sms_send_batches').update({ provider_group_ids: groupIds }).eq('id', batch.id);

  const rejected = rows.filter((r) => r.status === 'rejected');
  return {
    ok: true,
    batchId: batch.id,
    total: rows.length,
    accepted: rows.length - rejected.length,
    rejected: rejected.length,
    rejectedItems: rejected.map((r) => ({ userId: r.user_id, name: r.name, phone: r.phone, reason: r.reason })),
  };
}

/** 솔라피에서 전송 중 건의 최종 결과를 가져와 반영한다. 반환 = 바뀐 건수 */
export async function syncSmsBatch(programId: string, batchId: string): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('sms_send_batches').select('id, program_id, provider_group_ids').eq('id', batchId).maybeSingle();
  if (!batch || batch.program_id !== programId) return { ok: false, error: '이 행사의 발송 기록이 아닙니다.' };
  const items = await fetchAllIn<{ id: string; status: string; provider_message_id: string | null; status_code: string | null; reason: string | null }>([batchId], (chunk, from, to) =>
    admin.from('sms_send_items').select('id, status, provider_message_id, status_code, reason').in('batch_id', chunk).order('id').range(from, to),
  );
  const open = items.filter((it) => it.status === 'pending');
  if (open.length === 0 || batch.provider_group_ids.length === 0) {
    await admin.from('sms_send_batches').update({ last_synced_at: new Date().toISOString() }).eq('id', batchId);
    return { ok: true, updated: 0 };
  }
  const creds = await resolveSmsCredentials(programId, 'test');
  if (!creds) return { ok: false, error: '문자 API 자격증명을 읽을 수 없습니다.' };
  const byMsg = new Map<string, { statusCode: string | null; status: string | null; reason: string | null }>();
  const byRef = new Map<string, { statusCode: string | null; status: string | null; reason: string | null }>();
  for (const gid of batch.provider_group_ids) {
    const r = await listSolapiMessages({ apiKey: creds.apiKey, apiSecret: creds.apiSecret, senderNumber: creds.senderNumber }, { groupId: gid });
    if (!r.ok) return { ok: false, error: `솔라피 조회 실패: ${r.error}` };
    for (const m of r.messages) {
      const v = { statusCode: m.statusCode, status: m.status, reason: m.reason };
      byMsg.set(m.messageId, v);
      if (m.ref) byRef.set(m.ref, v);
    }
  }
  const now = new Date().toISOString();
  const updates = open
    .map((it) => {
      const m = (it.provider_message_id ? byMsg.get(it.provider_message_id) : undefined) ?? byRef.get(it.id);
      if (!m) return null;
      const status = classifySolapiStatus(m.statusCode, m.status);
      if (status === it.status && (m.statusCode ?? null) === it.status_code) return null;
      return { id: it.id, status, status_code: m.statusCode, reason: status === 'failed' ? m.reason : null };
    })
    .filter((u): u is NonNullable<typeof u> => !!u);
  for (let i = 0; i < updates.length; i += 20) {
    await Promise.all(updates.slice(i, i + 20).map((u) => admin.from('sms_send_items').update({ status: u.status, status_code: u.status_code, reason: u.reason, updated_at: now }).eq('id', u.id)));
  }
  await admin.from('sms_send_batches').update({ last_synced_at: now }).eq('id', batchId);
  return { ok: true, updated: updates.length };
}

export interface SmsBatchSummary {
  id: string;
  createdAt: string;
  kind: string;
  title: string | null;
  template: string;
  createdByName: string | null;
  lastSyncedAt: string | null;
  parentBatchId: string | null;
  counts: SmsBatchCounts;
  /** 이미 다시 보낸(재발송 묶음에 포함된) 실패 건 수 */
  retried: number;
}

export async function listSmsBatches(programId: string, limit = 30): Promise<SmsBatchSummary[]> {
  const admin = createAdminClient();
  const { data: batches } = await admin
    .from('sms_send_batches')
    .select('id, created_at, kind, title, text_template, created_by, last_synced_at, parent_batch_id')
    .eq('program_id', programId)
    .order('created_at', { ascending: false })
    .limit(limit);
  const list = batches ?? [];
  if (list.length === 0) return [];
  const items = await fetchAllIn<{ batch_id: string; status: string; retried_in_batch_id: string | null }>(list.map((b) => b.id), (chunk, from, to) =>
    admin.from('sms_send_items').select('batch_id, status, retried_in_batch_id').in('batch_id', chunk).order('id').range(from, to),
  );
  const userIds = Array.from(new Set(list.map((b) => b.created_by).filter((x): x is string => !!x)));
  const users = await fetchAllIn<{ id: string; name: string }>(userIds, (chunk, from, to) => admin.from('users').select('id, name').in('id', chunk).range(from, to));
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  return list.map((b) => {
    const mine = items.filter((it) => it.batch_id === b.id);
    return {
      id: b.id,
      createdAt: b.created_at,
      kind: b.kind,
      title: b.title,
      template: b.text_template,
      createdByName: b.created_by ? (nameOf.get(b.created_by) ?? null) : null,
      lastSyncedAt: b.last_synced_at,
      parentBatchId: b.parent_batch_id,
      counts: countStatuses(mine.map((m) => m.status)),
      retried: mine.filter((m) => m.retried_in_batch_id).length,
    };
  });
}

export interface SmsItemRow {
  id: string;
  userId: string | null;
  name: string;
  phone: string;
  status: string;
  statusCode: string | null;
  reason: string | null;
  text: string;
  retriedInBatchId: string | null;
  updatedAt: string;
}

export async function listSmsBatchItems(programId: string, batchId: string): Promise<SmsItemRow[]> {
  const admin = createAdminClient();
  const rows = await fetchAllIn<{ id: string; user_id: string | null; name: string; phone: string; status: string; status_code: string | null; reason: string | null; text: string; retried_in_batch_id: string | null; updated_at: string; program_id: string }>([batchId], (chunk, from, to) =>
    admin.from('sms_send_items').select('id, user_id, name, phone, status, status_code, reason, text, retried_in_batch_id, updated_at, program_id').in('batch_id', chunk).order('name').range(from, to),
  );
  return rows
    .filter((r) => r.program_id === programId)
    .map((r) => ({ id: r.id, userId: r.user_id, name: r.name, phone: r.phone, status: r.status, statusCode: r.status_code, reason: r.reason, text: r.text, retriedInBatchId: r.retried_in_batch_id, updatedAt: r.updated_at }));
}

// ───────────── 기록 이전(2026-11-03 전) 일괄 발송 — 감사 로그 + 솔라피 조회로 확인 ─────────────

export interface LegacySmsSend {
  auditId: string;
  createdAt: string;
  actorName: string | null;
  total: number;
  sent: number;
  failed: number;
  /** 감사 로그에 남은 실패 회원 id (예전 기록은 최대 200명까지만 남음) */
  failedIds: string[];
}

export async function listLegacySmsSends(programId: string, days = 60): Promise<LegacySmsSend[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await admin
    .from('audit_logs')
    .select('id, created_at, actor_id, metadata')
    .eq('program_id', programId)
    .eq('action', 'sms.bulk_send')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = (data ?? []).filter((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    return !m.batch_id;
  });
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)));
  const users = await fetchAllIn<{ id: string; name: string }>(actorIds, (chunk, from, to) => admin.from('users').select('id, name').in('id', chunk).range(from, to));
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' ? v : 0);
    return {
      auditId: r.id,
      createdAt: r.created_at,
      actorName: r.actor_id ? (nameOf.get(r.actor_id) ?? null) : null,
      total: num(m.total),
      sent: num(m.sent),
      failed: num(m.failed),
      failedIds: Array.isArray(m.failed_ids) ? (m.failed_ids as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    };
  });
}

export interface LegacySmsRow {
  userId: string | null;
  name: string;
  phone: string;
  status: 'rejected' | 'pending' | 'delivered' | 'failed';
  statusCode: string | null;
  reason: string | null;
}

/**
 * 기록 이전 일괄 발송 한 건의 수신 결과 — 감사 시각 직전 10분의 솔라피 발송 내역(행사 문자 계정)과 감사 로그의 실패 회원을 합친다.
 * 솔라피가 접수 거부(호출 한도 등)한 건은 솔라피에 남지 않으므로 감사 로그의 failed_ids 로만 알 수 있다.
 */
export async function loadLegacySmsSend(programId: string, auditId: string): Promise<{ ok: true; send: LegacySmsSend; rows: LegacySmsRow[]; sampleText: string | null; missingFailed: number } | { ok: false; error: string }> {
  const sends = await listLegacySmsSends(programId, 120);
  const send = sends.find((s) => s.auditId === auditId);
  if (!send) return { ok: false, error: '발송 기록을 찾을 수 없습니다.' };
  const creds = await resolveSmsCredentials(programId, 'test');
  if (!creds) return { ok: false, error: '문자 API 자격증명을 읽을 수 없습니다.' };
  const end = new Date(Date.parse(send.createdAt) + 60_000).toISOString();
  const start = new Date(Date.parse(send.createdAt) - 10 * 60_000).toISOString();
  const r = await listSolapiMessages({ apiKey: creds.apiKey, apiSecret: creds.apiSecret, senderNumber: creds.senderNumber }, { startDate: start, endDate: end }, 4);
  if (!r.ok) return { ok: false, error: `솔라피 조회 실패: ${r.error}` };

  // 이 행사 회원 이름 대조 (휴대폰 숫자 기준)
  const admin = createAdminClient();
  const members = await fetchAllIn<{ user_id: string }>([programId], (chunk, from, to) => admin.from('program_members').select('user_id').in('program_id', chunk).order('user_id').range(from, to));
  const users = await fetchAllIn<{ id: string; name: string; phone: string | null }>(members.map((m) => m.user_id), (chunk, from, to) => admin.from('users').select('id, name, phone').in('id', chunk).range(from, to));
  const digits = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '');
  const byPhone = new Map(users.filter((u) => digits(u.phone)).map((u) => [digits(u.phone), u]));
  const byId = new Map(users.map((u) => [u.id, u]));

  const rows: LegacySmsRow[] = [];
  const seenUsers = new Set<string>();
  for (const m of r.messages) {
    const u = byPhone.get(digits(m.to));
    const status = classifySolapiStatus(m.statusCode, m.status);
    if (u) seenUsers.add(u.id);
    rows.push({ userId: u?.id ?? null, name: u?.name ?? '(회원 아님)', phone: m.to, status, statusCode: m.statusCode, reason: status === 'failed' ? m.reason : null });
  }
  for (const id of send.failedIds) {
    if (seenUsers.has(id)) continue;
    const u = byId.get(id);
    rows.push({ userId: id, name: u?.name ?? '(알 수 없음)', phone: u?.phone ?? '', status: 'rejected', statusCode: '429', reason: 'TooManyRequests' });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { ok: true, send, rows, sampleText: r.messages.find((m) => m.text)?.text ?? null, missingFailed: Math.max(0, send.failed - send.failedIds.length) };
}
