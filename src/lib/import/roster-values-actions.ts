'use server';

import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { normalizeHeader } from '@/lib/import/bulk-import';
import { normalizePhone } from '@/lib/utils/phone';

/**
 * 임의 컬럼(카테고리 마크) 엑셀 업로드 (P31) — 순위 업로드와 같은 방식.
 * 헤더: 이름 · 휴대폰(식별) + 임의 컬럼 이름들(roster_columns.name 과 일치). 값이 비면 그 셀은 건드리지 않고, '-' 는 지운다.
 * 대상 = 현재 범위(행사/그룹)의 멘티 또는 멘토 소속.
 */
export interface RosterValuesUploadResult {
  ok: true;
  updated: number;
  cleared: number;
  matchedColumns: string[];
  unknownColumns: string[];
  notFound: string[];
  ambiguous: string[];
}
type Result = RosterValuesUploadResult | { ok: false; error: string };

export async function uploadRosterValuesAction(formData: FormData): Promise<Result> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'members');
  if (denied) return { ok: false, error: denied };
  const target = String(formData.get('target') ?? '') === 'mentor' ? 'mentor' : 'mentee';
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: '엑셀 파일을 선택하세요.' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: '파일은 5MB 이하여야 합니다.' };

  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]!];
    rows = ws ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false }) : [];
  } catch {
    return { ok: false, error: '엑셀 파일을 읽지 못했습니다. xlsx 형식인지 확인하세요.' };
  }
  if (rows.length === 0) return { ok: false, error: '데이터 행이 없습니다.' };
  const keys = Object.keys(rows[0]!);
  const normKeys = keys.map((k) => normalizeHeader(k));
  const nameKey = keys[normKeys.findIndex((k) => ['이름', '성명', '멘티명', '멘토명', '멘티', '멘토'].includes(k))];
  const phoneKey = keys[normKeys.findIndex((k) => ['휴대폰', '핸드폰', '연락처', '전화', '전화번호', '휴대전화', 'phone'].includes(k))];
  if (!nameKey && !phoneKey) return { ok: false, error: `헤더에서 이름 또는 휴대폰 컬럼을 찾지 못했습니다. 현재 헤더: ${keys.join(', ')}` };

  const admin = createAdminClient();
  const { data: columns, error: colErr } = await admin.from('roster_columns').select('id, name').eq('program_id', ctx.programId).eq('target', target);
  if (colErr) return { ok: false, error: colErr.message };
  const colByNorm = new Map((columns ?? []).map((c) => [normalizeHeader(c.name), c]));
  const identKeys = new Set([nameKey, phoneKey].filter(Boolean));
  const matched: { key: string; id: string; name: string }[] = [];
  const unknownColumns: string[] = [];
  for (const k of keys) {
    if (identKeys.has(k)) continue;
    const c = colByNorm.get(normalizeHeader(k));
    if (c) matched.push({ key: k, id: c.id, name: c.name });
    else if (k.trim()) unknownColumns.push(k);
  }
  if (matched.length === 0) return { ok: false, error: `임의 컬럼과 이름이 일치하는 헤더가 없습니다. 등록된 컬럼: ${(columns ?? []).map((c) => c.name).join(', ') || '(없음)'}` };

  // 범위의 대상 회원 (멘티 = 그룹 케이스 보유, 멘토 = 행사 소속 멘토)
  const members = await fetchAll<{ user_id: string }>((from, to) => admin.from('program_members').select('user_id').eq('program_id', ctx.programId).eq('role', target).eq('is_active', true).range(from, to)).catch((e: Error) => e);
  if (members instanceof Error) return { ok: false, error: members.message };
  let ids = members.map((m) => m.user_id);
  if (target === 'mentee' && ctx.supportTypeId) {
    const cases = await fetchAll<{ mentee_id: string | null }>((from, to) => admin.from('cases').select('mentee_id').eq('support_type_id', ctx.supportTypeId!).not('mentee_id', 'is', null).range(from, to)).catch((e: Error) => e);
    if (cases instanceof Error) return { ok: false, error: cases.message };
    const inGroup = new Set(cases.map((c) => c.mentee_id as string));
    ids = ids.filter((id) => inGroup.has(id));
  }
  const users = await fetchAllIn<{ id: string; name: string; phone: string | null }>(ids, (chunk, from, to) => admin.from('users').select('id, name, phone').in('id', chunk).range(from, to)).catch((e: Error) => e);
  if (users instanceof Error) return { ok: false, error: users.message };
  const byPhone = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  for (const u of users) {
    const p = normalizePhone(u.phone);
    if (p) (byPhone.get(p) ?? byPhone.set(p, []).get(p)!).push(u.id);
    const n = (u.name ?? '').replace(/\s+/g, '');
    if (n) (byName.get(n) ?? byName.set(n, []).get(n)!).push(u.id);
  }

  const upserts: { column_id: string; user_id: string; value: string; updated_by: string; updated_at: string }[] = [];
  const deletes: { column_id: string; user_id: string }[] = [];
  const notFound: string[] = [];
  const ambiguous: string[] = [];
  const now = new Date().toISOString();
  for (const r of rows) {
    const name = nameKey ? String(r[nameKey] ?? '').trim() : '';
    const phone = phoneKey ? normalizePhone(String(r[phoneKey] ?? '')) : null;
    if (!name && !phone) continue;
    const candidates = phone ? (byPhone.get(phone) ?? []) : byName.get(name.replace(/\s+/g, '')) ?? [];
    if (candidates.length === 0) {
      notFound.push(name || phone || '-');
      continue;
    }
    if (candidates.length > 1) {
      ambiguous.push(`${name || phone} (${candidates.length}명 — 휴대폰 컬럼으로 구분하세요)`);
      continue;
    }
    const userId = candidates[0]!;
    for (const col of matched) {
      const raw = String(r[col.key] ?? '').trim();
      if (!raw) continue;
      if (raw === '-') deletes.push({ column_id: col.id, user_id: userId });
      else upserts.push({ column_id: col.id, user_id: userId, value: raw.slice(0, 60), updated_by: profile.id, updated_at: now });
    }
  }
  if (upserts.length) {
    const { error } = await admin.from('roster_values').upsert(upserts, { onConflict: 'column_id,user_id' });
    if (error) return { ok: false, error: error.message };
  }
  for (const d of deletes) {
    const { error } = await admin.from('roster_values').delete().eq('column_id', d.column_id).eq('user_id', d.user_id);
    if (error) return { ok: false, error: error.message };
  }
  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: profile.id,
    program_id: ctx.programId,
    action: 'roster.values_upload',
    entity_type: 'programs',
    entity_id: ctx.programId,
    metadata: { target, file: file.name, rows: rows.length, updated: upserts.length, cleared: deletes.length, columns: matched.map((c) => c.name), not_found: notFound.length, ambiguous: ambiguous.length, support_type_id: ctx.supportTypeId ?? null },
  });
  if (auditError) console.error('roster values upload audit failed:', auditError.message);
  revalidatePath('/nextlab/roster');
  return { ok: true, updated: upserts.length, cleared: deletes.length, matchedColumns: matched.map((c) => c.name), unknownColumns, notFound, ambiguous };
}
