'use server';

import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';

/**
 * 멘티 순위 엑셀 업로드 (P27-01, P31 보강) — "멘티명, 멘티 순위" 파일로 mentee_profiles.rank 를 갱신한다.
 * 헤더는 이름/멘티명/멘티 · 순위 · 고유번호(선택) 를 느슨하게 인식. 고유번호가 있으면 그것으로, 없으면 이름으로 케이스를 찾는다.
 * 현재 범위(행사 전체/그룹)의 **진행 중** 케이스만 대상(중도 종료 제외). 같은 멘티(mentee_id)의 케이스가 범위 안에 여럿이면
 * 동명이인이 아니라 같은 사람이므로 전부 갱신한다. 빈 값·'-' 는 순위 해제.
 */
export interface RankUploadResult {
  ok: true;
  updated: number;
  /** 순위 해제(빈 값·'-') 건수 */
  cleared: number;
  notFound: string[];
  ambiguous: string[];
  invalid: string[];
  /** 같은 멘티가 여러 행에 있으면 마지막 행만 적용 */
  duplicate: string[];
}
type Result = RankUploadResult | { ok: false; error: string };

const pickKey = (keys: string[], re: RegExp) => keys.find((k) => re.test(k.normalize('NFKC').replace(/\s/g, '')));

export async function uploadMenteeRankAction(formData: FormData): Promise<Result> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.manage');
  if (denied) return { ok: false, error: denied };
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
  const nameKey = pickKey(keys, /^(멘티명|이름|성명|멘티이름|멘티)$/) ?? pickKey(keys, /멘티명|이름|성명/);
  const rankKey = pickKey(keys, /순위/);
  const noKey = pickKey(keys, /고유번호/);
  if (!nameKey || !rankKey) return { ok: false, error: `헤더에서 이름(멘티명)과 순위 컬럼을 찾지 못했습니다. 현재 헤더: ${keys.join(', ')}` };

  const admin = createAdminClient();
  // 범위의 진행 중 케이스 (중도 종료 제외) — 1,000행 캡 안전
  const cases = await fetchAll<{ id: string; owner_name: string; mentee_id: string | null; support_type_id: string }>((from, to) => {
    let q = admin.from('cases').select('id, owner_name, mentee_id, support_type_id').eq('program_id', ctx.programId).neq('status', 'withdrawn');
    if (ctx.supportTypeId) q = q.eq('support_type_id', ctx.supportTypeId);
    return q.range(from, to);
  }).catch((e: Error) => e);
  if (cases instanceof Error) return { ok: false, error: cases.message };
  const profiles = await fetchAllIn<{ case_id: string; external_no: string | null }>(cases.map((c) => c.id), (chunk, from, to) => admin.from('mentee_profiles').select('case_id, external_no').in('case_id', chunk).range(from, to)).catch((e: Error) => e);
  if (profiles instanceof Error) return { ok: false, error: profiles.message };
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const byNo = new Map<string, string[]>();
  for (const p of profiles) if (p.external_no) (byNo.get(p.external_no.trim()) ?? byNo.set(p.external_no.trim(), []).get(p.external_no.trim())!).push(p.case_id);
  const byName = new Map<string, string[]>();
  for (const c of cases) {
    const k = c.owner_name.replace(/\s+/g, '');
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(c.id);
  }
  /** 같은 mentee_id 의 케이스를 한 사람으로 묶는다 — 승계로 범위 안에 케이스가 2건이어도 동명이인이 아니다 (P31) */
  const distinctPeople = (ids: string[]): string[][] => {
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const c = caseById.get(id);
      const key = c?.mentee_id ?? `case:${id}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(id);
    }
    return Array.from(groups.values());
  };

  const rankByCase = new Map<string, number | null>();
  const notFound: string[] = [];
  const ambiguous: string[] = [];
  const invalid: string[] = [];
  const duplicate: string[] = [];
  for (const r of rows) {
    const name = String(r[nameKey] ?? '').trim();
    const rankRaw = String(r[rankKey] ?? '').trim();
    const no = noKey ? String(r[noKey] ?? '').trim() : '';
    if (!name && !no) continue;
    // 빈 값·'-' = 순위 해제 (P31)
    const clear = rankRaw === '' || rankRaw === '-';
    const rank = clear ? null : Number(rankRaw);
    if (!clear && (!Number.isInteger(rank) || (rank as number) < 1)) {
      invalid.push(`${name || no}: 순위 '${rankRaw}' (1 이상의 정수 또는 빈 값/'-')`);
      continue;
    }
    // 고유번호가 적혀 있으면 그것으로만 찾는다(다른 사람에게 잘못 붙는 것을 막기 위해 이름 폴백 없음)
    const ids = no ? (byNo.get(no) ?? []) : name ? (byName.get(name.replace(/\s+/g, '')) ?? []) : [];
    if (ids.length === 0) {
      notFound.push(no ? `${name || '-'} (고유번호 ${no})` : name);
      continue;
    }
    const people = distinctPeople(ids);
    if (people.length > 1) {
      ambiguous.push(`${name || no} (${people.length}명 — 고유번호 컬럼으로 구분하세요)`);
      continue;
    }
    const targetIds = people[0]!;
    if (targetIds.some((id) => rankByCase.has(id))) duplicate.push(name || no);
    for (const id of targetIds) rankByCase.set(id, rank);
  }
  const updates = Array.from(rankByCase.entries()).map(([case_id, rank]) => ({ case_id, program_id: ctx.programId, rank }));
  if (updates.length > 0) {
    const { error } = await admin.from('mentee_profiles').upsert(updates, { onConflict: 'case_id' });
    if (error) return { ok: false, error: error.message };
  }
  const cleared = updates.filter((u) => u.rank === null).length;
  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: profile.id,
    program_id: ctx.programId,
    action: 'mentee.rank_upload',
    entity_type: 'programs',
    entity_id: ctx.programId,
    metadata: { file: file.name, rows: rows.length, updated: updates.length - cleared, cleared, not_found: notFound.length, ambiguous: ambiguous.length, invalid: invalid.length, duplicate: duplicate.length, support_type_id: ctx.supportTypeId ?? null },
  });
  if (auditError) console.error('rank upload audit failed:', auditError.message);
  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/reports');
  return { ok: true, updated: updates.length - cleared, cleared, notFound, ambiguous, invalid, duplicate };
}
