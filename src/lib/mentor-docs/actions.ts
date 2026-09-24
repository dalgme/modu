'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless, type CapabilityKey } from '@/lib/auth/capabilities';
import { getImpersonation } from '@/lib/auth/impersonation';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/workflow/audit';
import { MAX_DOC_ITEMS, parseDocItems, resolveChecklistForGroup, type MentorDocItem } from '@/lib/mentor-docs/data';
import type { Json } from '@/types/database';

/**
 * 멘토 서류 수령 체크 액션 (P32) — 운영사 전용, 실명(realRoleOrNull) 기준·대행 불가.
 *  - 체크리스트 설정: `settings` 권한. 수령 체크: `mentors.docs` 권한.
 *  - 유니크가 표현식 인덱스(coalesce)라 onConflict upsert 를 못 쓴다 → 수동 select→update/insert.
 */

export type MentorDocResult = { ok: true; message?: string } | { ok: false; error: string };

const OPERATOR_ONLY = '운영사 담당자만 실행할 수 있습니다.';

async function operator(cap: CapabilityKey): Promise<{ id: string; programId: string } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: OPERATOR_ONLY };
  if (await getImpersonation()) return { error: '대행(view-as) 중에는 멘토 서류 수령 체크·설정을 바꿀 수 없습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, cap);
  if (denied) return { error: denied };
  return { id: profile.id, programId: ctx.programId };
}

/** 그룹 스코프면 이 행사의 사업그룹인지 확인 */
async function assertGroupInProgram(programId: string, supportTypeId: string | null): Promise<string | null> {
  if (!supportTypeId) return null;
  const { data } = await createAdminClient().from('support_types').select('id').eq('id', supportTypeId).eq('program_id', programId).maybeSingle();
  return data ? null : '이 행사의 사업그룹이 아닙니다.';
}

function revalidate() {
  revalidatePath('/nextlab/settings');
  revalidatePath('/nextlab/roster');
  revalidatePath('/mentor/dashboard');
  revalidatePath('/institution/mentors');
}

/** 새 항목 키 — 한글 이름에서 만들지 않고 난수 슬러그 (이름을 바꿔도 키는 유지) */
function newItemKey(existing: Set<string>): string {
  for (;;) {
    const k = `d_${randomBytes(4).toString('hex')}`;
    if (!existing.has(k)) return k;
  }
}

/* ── 체크리스트 설정 ───────────────────────────────────────────────────── */

async function findChecklistRow(programId: string, supportTypeId: string | null): Promise<{ id: string; items: Json } | null> {
  let q = createAdminClient().from('mentor_doc_checklists').select('id, items').eq('program_id', programId);
  q = supportTypeId ? q.eq('support_type_id', supportTypeId) : q.is('support_type_id', null);
  const { data } = await q.maybeSingle();
  return data ?? null;
}

/**
 * 체크리스트 저장 — 서류명 trim·중복 제거·최대 20개. 클라이언트가 key 를 보낸 항목은 키 유지(이름 변경),
 * 없는 항목은 새 키 발급. 기존 행에 있던 키만 인정한다(임의 키 주입 방지).
 */
export async function saveMentorDocChecklistAction(input: {
  supportTypeId: string | null;
  enabled: boolean;
  items: { key?: string | null; name: string }[];
}): Promise<MentorDocResult> {
  const op = await operator('settings');
  if ('error' in op) return { ok: false, error: op.error };
  const supportTypeId = input.supportTypeId?.trim() || null;
  const scopeErr = await assertGroupInProgram(op.programId, supportTypeId);
  if (scopeErr) return { ok: false, error: scopeErr };
  if (!Array.isArray(input.items)) return { ok: false, error: '서류 목록이 올바르지 않습니다.' };

  const existing = await findChecklistRow(op.programId, supportTypeId);
  const knownKeys = new Set(parseDocItems(existing?.items).map((i) => i.key));
  const usedKeys = new Set<string>();
  const seenNames = new Set<string>();
  const items: MentorDocItem[] = [];
  for (const raw of input.items) {
    const name = String(raw?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!name) continue;
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    const wanted = String(raw?.key ?? '').trim();
    const key = wanted && knownKeys.has(wanted) && !usedKeys.has(wanted) ? wanted : newItemKey(new Set(Array.from(knownKeys).concat(Array.from(usedKeys))));
    usedKeys.add(key);
    items.push({ key, name });
  }
  if (items.length > MAX_DOC_ITEMS) return { ok: false, error: `서류는 최대 ${MAX_DOC_ITEMS}개까지 등록할 수 있습니다.` };
  const enabled = !!input.enabled;
  if (enabled && items.length === 0) return { ok: false, error: '사용하려면 서류명을 1개 이상 등록하세요.' };

  const admin = createAdminClient();
  const fields = { enabled, items: items as unknown as Json };
  const { error } = existing
    ? await admin.from('mentor_doc_checklists').update(fields).eq('id', existing.id)
    : await admin.from('mentor_doc_checklists').insert({ program_id: op.programId, support_type_id: supportTypeId, ...fields });
  if (error) return { ok: false, error: error.message };
  await logAudit(admin, {
    actorId: op.id,
    programId: op.programId,
    action: 'mentor_docs.checklist_saved',
    entityType: 'programs',
    entityId: op.programId,
    metadata: { support_type_id: supportTypeId, enabled, items: items.map((i) => i.name), count: items.length },
  });
  revalidate();
  return { ok: true, message: supportTypeId ? '그룹 전용 서류 목록을 저장했습니다.' : '행사 공통 서류 목록을 저장했습니다.' };
}

/** 그룹 override 해제 — 그룹 행 삭제 → 그 그룹은 행사 공통을 따른다 (수령 기록은 그룹 스코프로 남는다) */
export async function clearMentorDocGroupChecklistAction(supportTypeId: string): Promise<MentorDocResult> {
  const op = await operator('settings');
  if ('error' in op) return { ok: false, error: op.error };
  const sid = supportTypeId?.trim();
  if (!sid) return { ok: false, error: '그룹 설정에서만 해제할 수 있습니다.' };
  const scopeErr = await assertGroupInProgram(op.programId, sid);
  if (scopeErr) return { ok: false, error: scopeErr };
  const existing = await findChecklistRow(op.programId, sid);
  if (!existing) return { ok: false, error: '이 그룹에 별도 설정이 없습니다. (행사 공통을 따르는 중)' };
  const admin = createAdminClient();
  const { error } = await admin.from('mentor_doc_checklists').delete().eq('id', existing.id);
  if (error) return { ok: false, error: error.message };
  await logAudit(admin, {
    actorId: op.id,
    programId: op.programId,
    action: 'mentor_docs.checklist_saved',
    entityType: 'programs',
    entityId: op.programId,
    metadata: { support_type_id: sid, cleared: true },
  });
  revalidate();
  return { ok: true, message: '그룹 별도 설정을 해제했습니다. 이 그룹은 행사 공통 서류 목록을 따릅니다.' };
}

/* ── 수령 체크 ─────────────────────────────────────────────────────────── */

/** 수령 체크 공통 검증 — 스코프에 적용된 체크리스트(정확히 그 스코프의 행)와 서류 키·멘토 소속 */
async function receiptGuard(programId: string, supportTypeId: string | null, mentorIds: string[], itemKeys: string[]): Promise<{ error: string } | { ok: true }> {
  if (mentorIds.length === 0) return { error: '멘토를 선택하세요.' };
  if (itemKeys.length === 0) return { error: '서류를 선택하세요.' };
  const scopeErr = await assertGroupInProgram(programId, supportTypeId);
  if (scopeErr) return { error: scopeErr };
  const checklist = await resolveChecklistForGroup(programId, supportTypeId);
  if (!checklist || !checklist.enabled) return { error: '이 범위에서 서류 수령 체크를 사용하지 않습니다. 운영 설정 → 멘토 서류 수령에서 켜세요.' };
  if ((checklist.scope.supportTypeId ?? null) !== supportTypeId) return { error: '이 그룹은 별도 서류 목록이 없어 행사 공통으로 기록해야 합니다. 화면을 새로고침하세요.' };
  const known = new Set(checklist.items.map((i) => i.key));
  if (itemKeys.some((k) => !known.has(k))) return { error: '서류 목록이 바뀌었습니다. 화면을 새로고침하세요.' };
  const { data: members } = await createAdminClient().from('program_members').select('user_id').eq('program_id', programId).eq('role', 'mentor').in('user_id', mentorIds);
  if ((members ?? []).length !== new Set(mentorIds).size) return { error: '이 행사의 멘토가 아닌 계정이 포함되어 있습니다.' };
  return { ok: true };
}

async function writeReceipts(input: { actorId: string; programId: string; supportTypeId: string | null; mentorIds: string[]; itemKeys: string[]; received: boolean; note?: string | null }): Promise<string | null> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  let q = admin.from('mentor_doc_receipts').select('id, mentor_id, item_key').eq('program_id', input.programId).in('mentor_id', input.mentorIds).in('item_key', input.itemKeys);
  q = input.supportTypeId ? q.eq('support_type_id', input.supportTypeId) : q.is('support_type_id', null);
  const { data: existing, error: selErr } = await q;
  if (selErr) return selErr.message;
  const existingId = new Map((existing ?? []).map((r) => [`${r.mentor_id}|${r.item_key}`, r.id]));
  const fields = {
    received: input.received,
    received_at: input.received ? now : null,
    received_by: input.received ? input.actorId : null,
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
  const inserts: { program_id: string; support_type_id: string | null; mentor_id: string; item_key: string; received: boolean; received_at: string | null; received_by: string | null; note?: string | null }[] = [];
  for (const mentorId of input.mentorIds) {
    for (const itemKey of input.itemKeys) {
      const id = existingId.get(`${mentorId}|${itemKey}`);
      if (id) {
        const { error } = await admin.from('mentor_doc_receipts').update(fields).eq('id', id);
        if (error) return error.message;
      } else {
        inserts.push({ program_id: input.programId, support_type_id: input.supportTypeId, mentor_id: mentorId, item_key: itemKey, ...fields });
      }
    }
  }
  if (inserts.length) {
    const { error } = await admin.from('mentor_doc_receipts').insert(inserts);
    if (error) return error.message;
  }
  for (const mentorId of input.mentorIds) {
    await logAudit(admin, {
      actorId: input.actorId,
      programId: input.programId,
      action: 'mentor_docs.receipt',
      entityType: 'users',
      entityId: mentorId,
      metadata: { support_type_id: input.supportTypeId, item_keys: input.itemKeys, received: input.received, ...(input.note !== undefined ? { note: input.note } : {}) },
    });
  }
  return null;
}

/** 멘토 1명 × 서류 1건 수령/해제 (명단 O/– 토글) */
export async function setMentorDocReceiptAction(input: { mentorId: string; supportTypeId: string | null; itemKey: string; received: boolean; note?: string }): Promise<MentorDocResult> {
  const op = await operator('mentors.docs');
  if ('error' in op) return { ok: false, error: op.error };
  const supportTypeId = input.supportTypeId?.trim() || null;
  const mentorId = String(input.mentorId ?? '').trim();
  const itemKey = String(input.itemKey ?? '').trim();
  const g = await receiptGuard(op.programId, supportTypeId, [mentorId], [itemKey]);
  if ('error' in g) return { ok: false, error: g.error };
  const note = input.note === undefined ? undefined : String(input.note).trim().slice(0, 200) || null;
  const err = await writeReceipts({ actorId: op.id, programId: op.programId, supportTypeId, mentorIds: [mentorId], itemKeys: [itemKey], received: !!input.received, note });
  if (err) return { ok: false, error: err };
  revalidate();
  return { ok: true };
}

/** 여러 멘토 × 여러 서류 일괄 수령/해제 */
export async function setMentorDocReceiptsBulkAction(input: { mentorIds: string[]; supportTypeId: string | null; itemKeys: string[]; received: boolean }): Promise<MentorDocResult> {
  const op = await operator('mentors.docs');
  if ('error' in op) return { ok: false, error: op.error };
  const supportTypeId = input.supportTypeId?.trim() || null;
  const mentorIds = Array.from(new Set((input.mentorIds ?? []).map((s) => String(s).trim()).filter(Boolean)));
  const itemKeys = Array.from(new Set((input.itemKeys ?? []).map((s) => String(s).trim()).filter(Boolean)));
  if (mentorIds.length > 500) return { ok: false, error: '한 번에 500명까지 처리할 수 있습니다.' };
  const g = await receiptGuard(op.programId, supportTypeId, mentorIds, itemKeys);
  if ('error' in g) return { ok: false, error: g.error };
  const err = await writeReceipts({ actorId: op.id, programId: op.programId, supportTypeId, mentorIds, itemKeys, received: !!input.received });
  if (err) return { ok: false, error: err };
  revalidate();
  return { ok: true, message: `${mentorIds.length}명 × ${itemKeys.length}건을 ${input.received ? '수령' : '해제'} 처리했습니다.` };
}
