'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless, isPL, isStaffGrade, type CapabilityKey } from '@/lib/auth/capabilities';
import { contextOrNull, type ProgramContext } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import type { UserRole } from '@/lib/auth/roles';

/**
 * 회원 명단 일괄 작업 (P31) — 선택한 회원에게 단건 액션의 규칙을 그대로 반복 적용한다.
 *  - 전부 행사 범위(program_members) 안에서만 동작, 대상은 이 행사 소속이어야 한다
 *  - 건별 결과(성공/실패 사유)를 돌려주고, 건별 감사로그(program_id)를 남긴다
 */
export interface BulkItemResult {
  userId: string;
  ok: boolean;
  error?: string;
}
export type BulkResult = { ok: true; done: number; failed: BulkItemResult[]; message: string } | { ok: false; error: string };

const MAX_BULK = 300;

async function gate(key: CapabilityKey): Promise<{ ctx: ProgramContext; actorId: string } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, key);
  if (denied) return { error: denied };
  return { ctx, actorId: profile.id };
}

function cleanIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return Array.from(new Set(ids.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))).slice(0, MAX_BULK);
}

interface MemberLite { user_id: string; role: UserRole; grade: string | null; is_active: boolean }

/** 대상의 이 행사 멤버십 (없는 id 는 결과에서 빠진다) */
async function memberships(programId: string, ids: string[]): Promise<Map<string, MemberLite>> {
  const rows = await fetchAllIn<MemberLite>(ids, (chunk, from, to) => createAdminClient().from('program_members').select('user_id, role, grade, is_active').eq('program_id', programId).in('user_id', chunk).range(from, to));
  return new Map(rows.map((m) => [m.user_id, m]));
}

/** 감사 — 건별, insert 오류를 삼키지 않는다 (§6-3) */
async function auditMany(rows: { programId: string; actorId: string; action: string; entityId: string; metadata: Record<string, unknown> }[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await createAdminClient().from('audit_logs').insert(rows.map((r) => ({ actor_id: r.actorId, program_id: r.programId, action: r.action, entity_type: 'users', entity_id: r.entityId, metadata: r.metadata as never })));
  if (error) console.error('[roster/bulk-actions] audit insert failed:', error.message);
}

/** 운영사 담당자 보호: 등급·소속 변경은 members.staff, 마지막 활성 PL 은 비활성 불가 */
async function staffGuard(ctx: ProgramContext, target: MemberLite, others: MemberLite[]): Promise<string | null> {
  if (target.role !== 'nextlab') return null;
  const denied = denyUnless(ctx, 'members.staff');
  if (denied) return `운영사 담당자 변경 권한 없음 (${denied})`;
  const targetIsPL = target.grade === null || target.grade === 'pl';
  if (targetIsPL) {
    const otherPLs = others.filter((m) => m.user_id !== target.user_id && m.role === 'nextlab' && m.is_active && (m.grade === null || m.grade === 'pl'));
    if (otherPLs.length === 0) return '이 행사의 마지막 메인 담당자(PL)입니다.';
  }
  return null;
}

/**
 * 활성/비활성 일괄 — 행사 범위(program_members.is_active). lockAccount=true 면 users.is_active(로그인)도 함께.
 * 권한 members.sensitive. 본인·플랫폼 관리자·마지막 PL 은 건너뛴다.
 */
export async function bulkSetMemberActiveAction(userIds: string[], active: boolean, opts: { lockAccount?: boolean } = {}): Promise<BulkResult> {
  const g = await gate('members.sensitive');
  if ('error' in g) return { ok: false, error: g.error };
  const ids = cleanIds(userIds);
  if (ids.length === 0) return { ok: false, error: '대상 회원을 선택하세요.' };
  const admin = createAdminClient();
  const mems = await memberships(g.ctx.programId, ids);
  // 마지막 PL 판정용 — 이 행사의 운영사 담당자 전원
  const { data: staff } = await admin.from('program_members').select('user_id, role, grade, is_active').eq('program_id', g.ctx.programId).eq('role', 'nextlab');
  const staffAll = (staff ?? []) as MemberLite[];
  const failed: BulkItemResult[] = [];
  const audits: Parameters<typeof auditMany>[0] = [];
  let done = 0;
  const deactivating = new Set<string>();
  for (const id of ids) {
    const m = mems.get(id);
    if (!m) { failed.push({ userId: id, ok: false, error: '이 행사 소속이 아님' }); continue; }
    if (id === g.actorId) { failed.push({ userId: id, ok: false, error: '본인 계정' }); continue; }
    if (!active) {
      const guard = await staffGuard(g.ctx, m, staffAll.filter((s) => !deactivating.has(s.user_id)));
      if (guard) { failed.push({ userId: id, ok: false, error: guard }); continue; }
    }
    const { error } = await admin.from('program_members').update(active ? { is_active: true, left_at: null } : { is_active: false }).eq('program_id', g.ctx.programId).eq('user_id', id);
    if (error) { failed.push({ userId: id, ok: false, error: error.message }); continue; }
    if (opts.lockAccount) {
      const { data: t } = await admin.from('users').select('is_platform_admin').eq('id', id).maybeSingle();
      if (t?.is_platform_admin) { failed.push({ userId: id, ok: false, error: '플랫폼 관리자 계정은 잠글 수 없음(행사 소속만 변경)' }); continue; }
      const { error: lockError } = await admin.from('users').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', id);
      if (lockError) { failed.push({ userId: id, ok: false, error: `계정 잠금 실패: ${lockError.message}` }); continue; }
    }
    if (!active) deactivating.add(id);
    done += 1;
    audits.push({ programId: g.ctx.programId, actorId: g.actorId, action: active ? 'membership.activate' : 'membership.deactivate', entityId: id, metadata: { bulk: true, lock_account: !!opts.lockAccount } });
  }
  await auditMany(audits);
  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/members');
  return { ok: true, done, failed, message: `${active ? '활성화' : '비활성화'} ${done}명${failed.length ? ` · 실패 ${failed.length}명` : ''}${opts.lockAccount ? ' (계정 잠금 포함)' : ''}` };
}

/**
 * 멘토 그룹 지정 일괄 추가/해제 — support_type_members(member_role=mentor). 권한 mentors.docs (단건 setMentorGroupMembershipAction 과 동일).
 * 해제는 그 그룹에 활성 배정이 있으면 건너뛴다.
 */
export async function bulkSetMentorGroupsAction(mentorIds: string[], groupIds: string[], mode: 'add' | 'remove'): Promise<BulkResult> {
  const g = await gate('mentors.docs');
  if ('error' in g) return { ok: false, error: g.error };
  const ids = cleanIds(mentorIds);
  const gids = cleanIds(groupIds);
  if (ids.length === 0) return { ok: false, error: '대상 멘토를 선택하세요.' };
  if (gids.length === 0) return { ok: false, error: '그룹을 선택하세요.' };
  const admin = createAdminClient();
  const { data: groups } = await admin.from('support_types').select('id, name').eq('program_id', g.ctx.programId).in('id', gids);
  const validGroups = groups ?? [];
  if (validGroups.length !== gids.length) return { ok: false, error: '이 행사의 그룹이 아닌 항목이 있습니다.' };
  const mems = await memberships(g.ctx.programId, ids);
  const failed: BulkItemResult[] = [];
  const audits: Parameters<typeof auditMany>[0] = [];
  let done = 0;
  for (const id of ids) {
    const m = mems.get(id);
    if (!m || m.role !== 'mentor') { failed.push({ userId: id, ok: false, error: '이 행사의 멘토가 아님' }); continue; }
    const errs: string[] = [];
    for (const grp of validGroups) {
      if (mode === 'remove') {
        const { count } = await admin.from('mentor_assignments').select('id, cases!inner(support_type_id)', { count: 'exact', head: true }).eq('mentor_id', id).eq('is_active', true).eq('cases.support_type_id', grp.id);
        if ((count ?? 0) > 0) { errs.push(`${grp.name}: 담당 멘티 ${count}명`); continue; }
      }
      const { error } = await admin
        .from('support_type_members')
        .upsert({ support_type_id: grp.id, user_id: id, member_role: 'mentor', is_active: mode === 'add', left_at: mode === 'add' ? null : new Date().toISOString() }, { onConflict: 'support_type_id,user_id' });
      if (error) { errs.push(`${grp.name}: ${error.message}`); continue; }
      audits.push({ programId: g.ctx.programId, actorId: g.actorId, action: mode === 'add' ? 'mentor.group_assign' : 'mentor.group_unassign', entityId: id, metadata: { support_type_id: grp.id, group_name: grp.name, bulk: true } });
    }
    if (errs.length === validGroups.length) failed.push({ userId: id, ok: false, error: errs.join(' / ') });
    else {
      done += 1;
      if (errs.length) failed.push({ userId: id, ok: true, error: `일부 그룹 건너뜀 — ${errs.join(' / ')}` });
    }
  }
  await auditMany(audits);
  revalidatePath('/nextlab/roster');
  return { ok: true, done, failed, message: `그룹 지정 ${mode === 'add' ? '추가' : '해제'} ${done}명${failed.length ? ` · 실패/일부 ${failed.length}명` : ''}` };
}

/**
 * 원천징수 방식 일괄 — 그룹별 override(support_type_members.withholding_method). groupId null = 행사의 모든 그룹.
 * '' 는 그룹 기본으로 되돌림. 지정(is_active)은 건드리지 않는다 (P28 규칙: 원천징수 저장이 지정을 만들지 않음).
 */
export async function bulkSetWithholdingAction(mentorIds: string[], groupId: string | null, method: 'other_income' | 'business_income' | 'none' | ''): Promise<BulkResult> {
  const g = await gate('mentors.docs');
  if ('error' in g) return { ok: false, error: g.error };
  const ids = cleanIds(mentorIds);
  if (ids.length === 0) return { ok: false, error: '대상 멘토를 선택하세요.' };
  if (!['other_income', 'business_income', 'none', ''].includes(method)) return { ok: false, error: '원천징수 방식이 올바르지 않습니다.' };
  const admin = createAdminClient();
  let gq = admin.from('support_types').select('id, name').eq('program_id', g.ctx.programId);
  if (groupId) gq = gq.eq('id', groupId);
  const { data: groups } = await gq;
  if (!groups || groups.length === 0) return { ok: false, error: groupId ? '이 행사의 그룹이 아닙니다.' : '그룹이 없습니다.' };
  const mems = await memberships(g.ctx.programId, ids);
  const existing = await fetchAllIn<{ user_id: string; support_type_id: string; withholding_method: string | null }>(ids, (chunk, from, to) => admin.from('support_type_members').select('user_id, support_type_id, withholding_method').in('user_id', chunk).in('support_type_id', groups.map((x) => x.id)).range(from, to));
  const existingKey = new Map(existing.map((r) => [`${r.support_type_id}:${r.user_id}`, r.withholding_method]));
  const failed: BulkItemResult[] = [];
  const audits: Parameters<typeof auditMany>[0] = [];
  let done = 0;
  for (const id of ids) {
    const m = mems.get(id);
    if (!m || m.role !== 'mentor') { failed.push({ userId: id, ok: false, error: '이 행사의 멘토가 아님' }); continue; }
    let err: string | null = null;
    for (const grp of groups) {
      const key = `${grp.id}:${id}`;
      const has = existingKey.has(key);
      const { error } = has
        ? await admin.from('support_type_members').update({ withholding_method: method || null }).eq('support_type_id', grp.id).eq('user_id', id)
        : await admin.from('support_type_members').insert({ support_type_id: grp.id, user_id: id, member_role: 'mentor', is_active: false, withholding_method: method || null });
      if (error) { err = error.message; break; }
      audits.push({ programId: g.ctx.programId, actorId: g.actorId, action: 'settings.update', entityId: id, metadata: { key: 'mentor_withholding', support_type_id: grp.id, before: existingKey.get(key) ?? null, after: method || null, bulk: true } });
    }
    if (err) failed.push({ userId: id, ok: false, error: err });
    else done += 1;
  }
  await auditMany(audits);
  revalidatePath('/nextlab/roster');
  return { ok: true, done, failed, message: `원천징수 방식 변경 ${done}명${failed.length ? ` · 실패 ${failed.length}명` : ''}` };
}

/**
 * 비고 일괄 입력 — 발주처·운영사 = program_members.note, 멘토 = mentor_profiles.note. 멘티(케이스별 비고)는 대상이 아니다.
 * append=true 면 기존 비고 뒤에 줄바꿈으로 덧붙인다. 권한 members.
 */
export async function bulkSetNoteAction(userIds: string[], note: string, opts: { append?: boolean } = {}): Promise<BulkResult> {
  const g = await gate('members');
  if ('error' in g) return { ok: false, error: g.error };
  const ids = cleanIds(userIds);
  const text = (note ?? '').trim().slice(0, 500);
  if (ids.length === 0) return { ok: false, error: '대상 회원을 선택하세요.' };
  if (!text && opts.append) return { ok: false, error: '덧붙일 내용을 입력하세요.' };
  const admin = createAdminClient();
  const mems = await memberships(g.ctx.programId, ids);
  const { data: memberNotes } = await admin.from('program_members').select('user_id, note').eq('program_id', g.ctx.programId).in('user_id', ids);
  const mentorNotes = await fetchAllIn<{ user_id: string; note: string | null }>(ids, (chunk, from, to) => admin.from('mentor_profiles').select('user_id, note').eq('program_id', g.ctx.programId).in('user_id', chunk).range(from, to));
  const curMember = new Map((memberNotes ?? []).map((r) => [r.user_id, r.note]));
  const curMentor = new Map(mentorNotes.map((r) => [r.user_id, r.note]));
  const merge = (cur: string | null | undefined) => (opts.append && cur ? `${cur}\n${text}` : text) || null;
  const failed: BulkItemResult[] = [];
  const audits: Parameters<typeof auditMany>[0] = [];
  let done = 0;
  for (const id of ids) {
    const m = mems.get(id);
    if (!m) { failed.push({ userId: id, ok: false, error: '이 행사 소속이 아님' }); continue; }
    if (m.role === 'mentee') { failed.push({ userId: id, ok: false, error: '멘티 비고는 케이스 상세에서 입력' }); continue; }
    if (m.role === 'nextlab' && !isPL(g.ctx.grade) && isStaffGrade(m.grade) && m.grade === 'pl') { failed.push({ userId: id, ok: false, error: 'PL 의 비고는 PL 만 수정' }); continue; }
    const { error } =
      m.role === 'mentor'
        ? await admin.from('mentor_profiles').upsert({ program_id: g.ctx.programId, user_id: id, note: merge(curMentor.get(id)) }, { onConflict: 'program_id,user_id' })
        : await admin.from('program_members').update({ note: merge(curMember.get(id)) }).eq('program_id', g.ctx.programId).eq('user_id', id);
    if (error) { failed.push({ userId: id, ok: false, error: error.message }); continue; }
    done += 1;
    audits.push({ programId: g.ctx.programId, actorId: g.actorId, action: 'membership.profile', entityId: id, metadata: { note_bulk: true, append: !!opts.append, length: text.length } });
  }
  await auditMany(audits);
  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/members');
  return { ok: true, done, failed, message: `비고 ${opts.append ? '추가' : '입력'} ${done}명${failed.length ? ` · 건너뜀 ${failed.length}명` : ''}` };
}
