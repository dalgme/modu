'use server';

import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { matchDesiredRows, type DesiredRow } from '@/lib/import/desired-mentees';

/**
 * 라운드별 멘토 희망 멘티 수 엑셀 업로드 (2026-10-23).
 * 파일 = "멘토명, 전화번호, 이메일, 희망 멘티 수". 멘토명으로 찾고 동명이인은 전화번호(→이메일)로 구분한다.
 * 값은 support_type_members.desired_mentees 에 저장 — 행이 없으면 **그룹 지정이 아닌**(is_active=false) 행으로 만든다.
 * 파일에 없는 멘토의 값은 그대로 둔다. 운영사 `case.assign` 권한, 실제 신원.
 */
export interface DesiredUploadResult {
  ok: true;
  groupName: string;
  updated: number;
  cleared: number;
  notFound: string[];
  ambiguous: string[];
  invalid: string[];
  duplicate: string[];
}
type Result = DesiredUploadResult | { ok: false; error: string };

const pickKey = (keys: string[], re: RegExp) => keys.find((k) => re.test(k.normalize('NFKC').replace(/\s/g, '')));

export async function uploadMentorDesiredAction(formData: FormData): Promise<Result> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.assign');
  if (denied) return { ok: false, error: denied };

  const groupId = String(formData.get('group') ?? '');
  if (!groupId) return { ok: false, error: '라운드(사업그룹)를 선택하세요.' };
  const admin = createAdminClient();
  const { data: group } = await admin.from('support_types').select('id, name, program_id').eq('id', groupId).maybeSingle();
  if (!group || group.program_id !== ctx.programId) return { ok: false, error: '이 행사의 사업그룹이 아닙니다.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: '엑셀 파일을 선택하세요.' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: '파일은 5MB 이하여야 합니다.' };
  let raw: Record<string, unknown>[];
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]!];
    raw = ws ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false }) : [];
  } catch {
    return { ok: false, error: '엑셀 파일을 읽지 못했습니다. xlsx 형식인지 확인하세요.' };
  }
  if (raw.length === 0) return { ok: false, error: '데이터 행이 없습니다.' };
  const keys = Object.keys(raw[0]!);
  const nameKey = pickKey(keys, /^(멘토명|멘토|이름|성명|멘토이름)$/) ?? pickKey(keys, /멘토명|이름|성명/);
  const desiredKey = pickKey(keys, /희망/);
  const phoneKey = pickKey(keys, /전화|휴대폰|핸드폰|연락처/);
  const emailKey = pickKey(keys, /이메일|메일|email/i);
  if (!nameKey || !desiredKey) return { ok: false, error: `헤더에서 멘토명과 희망 멘티 수 컬럼을 찾지 못했습니다. 현재 헤더: ${keys.join(', ')}` };

  const rows: DesiredRow[] = raw.map((r, i) => ({
    line: i + 2,
    name: String(r[nameKey] ?? ''),
    phone: phoneKey ? String(r[phoneKey] ?? '') : '',
    email: emailKey ? String(r[emailKey] ?? '') : '',
    desired: String(r[desiredKey] ?? ''),
  }));

  // 이 행사의 활성 멘토 (설계 B: program_members.role)
  const { data: members, error: memErr } = await admin.from('program_members').select('user_id').eq('program_id', ctx.programId).eq('role', 'mentor').eq('is_active', true);
  if (memErr) return { ok: false, error: memErr.message };
  const users = await fetchAllIn<{ id: string; name: string; phone: string | null; email: string | null }>((members ?? []).map((m) => m.user_id), (chunk, from, to) =>
    admin.from('users').select('id, name, phone, email').in('id', chunk).range(from, to),
  );
  const result = matchDesiredRows(rows, users);

  const targetIds = Array.from(result.values.keys());
  const { data: existing } = targetIds.length
    ? await admin.from('support_type_members').select('user_id').eq('support_type_id', group.id).in('user_id', targetIds)
    : { data: [] as { user_id: string }[] };
  const has = new Set((existing ?? []).map((e) => e.user_id));
  let updated = 0;
  let cleared = 0;
  for (const [userId, value] of Array.from(result.values.entries())) {
    // 기존 행은 값만 바꾸고(그룹 지정 유지), 없으면 지정이 아닌 행으로 만든다 — 값 해제는 기존 행만
    const { error } = has.has(userId)
      ? await admin.from('support_type_members').update({ desired_mentees: value }).eq('support_type_id', group.id).eq('user_id', userId)
      : value === null
        ? { error: null }
        : await admin.from('support_type_members').insert({ support_type_id: group.id, user_id: userId, member_role: 'mentor', is_active: false, desired_mentees: value });
    if (error) return { ok: false, error: `저장 실패: ${error.message}` };
    if (value === null) cleared += 1;
    else updated += 1;
  }

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: profile.id,
    program_id: ctx.programId,
    action: 'mentor.desired_upload',
    entity_type: 'support_types',
    entity_id: group.id,
    metadata: { file: file.name, group_name: group.name, rows: rows.length, updated, cleared, not_found: result.notFound.length, ambiguous: result.ambiguous.length, invalid: result.invalid.length },
  });
  if (auditError) console.error('desired upload audit failed:', auditError.message);
  revalidatePath('/nextlab/roster');
  return { ok: true, groupName: group.name, updated, cleared, notFound: result.notFound, ambiguous: result.ambiguous, invalid: result.invalid, duplicate: result.duplicate };
}
