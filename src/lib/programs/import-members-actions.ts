'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** 운영사 + 행사 컨텍스트 + 'members' 권한 (실제 신원) */
async function operator(): Promise<{ id: string; programId: string } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'members');
  if (denied) return { error: denied };
  return { id: profile.id, programId: ctx.programId };
}

export interface ImportableProgram {
  id: string;
  name: string;
  status: string;
  mentorCount: number;
}

/** 실행자가 활성 운영사(nextlab) 소속인 다른 행사 — 멘토를 가져올 수 있는 원천 (P30) */
export async function listImportablePrograms(): Promise<Result<{ programs: ImportableProgram[] }>> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: mine } = await admin.from('program_members').select('program_id').eq('user_id', op.id).eq('role', 'nextlab').eq('is_active', true).neq('program_id', op.programId);
  const ids = Array.from(new Set((mine ?? []).map((m) => m.program_id)));
  if (ids.length === 0) return { ok: true, programs: [] };
  const [{ data: programs }, { data: mentors }] = await Promise.all([
    admin.from('programs').select('id, name, status').in('id', ids).order('created_at', { ascending: false }),
    admin.from('program_members').select('program_id').in('program_id', ids).eq('role', 'mentor').eq('is_active', true),
  ]);
  const countOf = new Map<string, number>();
  for (const m of mentors ?? []) countOf.set(m.program_id, (countOf.get(m.program_id) ?? 0) + 1);
  return { ok: true, programs: (programs ?? []).map((p) => ({ id: p.id, name: p.name, status: p.status, mentorCount: countOf.get(p.id) ?? 0 })) };
}

export interface ImportableMentor {
  userId: string;
  name: string;
  organization: string | null;
  expertise: string[];
  /** 이미 현재 행사에 활성 소속 */
  alreadyMember: boolean;
}

/** 원천 행사의 활성 멘토 (이름·소속·분야) — 실행자가 그 행사의 운영사여야 한다 */
export async function listProgramMentors(sourceProgramId: string): Promise<Result<{ mentors: ImportableMentor[] }>> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: allowed } = await admin.from('program_members').select('id').eq('user_id', op.id).eq('program_id', sourceProgramId).eq('role', 'nextlab').eq('is_active', true).maybeSingle();
  if (!allowed) return { ok: false, error: '원천 행사의 운영사 담당자만 멘토를 가져올 수 있습니다.' };
  const { data: members } = await admin.from('program_members').select('user_id').eq('program_id', sourceProgramId).eq('role', 'mentor').eq('is_active', true);
  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return { ok: true, mentors: [] };
  const [{ data: users }, { data: profiles }, { data: current }] = await Promise.all([
    admin.from('users').select('id, name, organization, is_active').in('id', ids).order('name'),
    admin.from('mentor_profiles').select('user_id, expertise').eq('program_id', sourceProgramId).in('user_id', ids),
    admin.from('program_members').select('user_id').eq('program_id', op.programId).in('user_id', ids).eq('is_active', true),
  ]);
  const expertiseOf = new Map((profiles ?? []).map((p) => [p.user_id, p.expertise ?? []]));
  const here = new Set((current ?? []).map((m) => m.user_id));
  return {
    ok: true,
    mentors: (users ?? [])
      .filter((u) => u.is_active)
      .map((u) => ({ userId: u.id, name: u.name, organization: u.organization ?? null, expertise: expertiseOf.get(u.id) ?? [], alreadyMember: here.has(u.id) })),
  };
}

/**
 * 다른 행사의 멘토를 현재 행사에 일괄 소속 (P30) — program_members(role=mentor, 활성) upsert + mentor_profiles 복사(있으면 유지).
 * 계정은 하나(설계 B: 역할은 행사별). 그룹 지정·배정은 옮기지 않는다.
 */
export async function importMembersFromProgramAction(sourceProgramId: string, userIds: string[]): Promise<Result<{ added: number; alreadyMember: number; profilesCopied: number; skipped: number }>> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : []).filter((x) => typeof x === 'string' && x.length > 0)));
  if (ids.length === 0) return { ok: false, error: '가져올 멘토를 선택하세요.' };
  if (sourceProgramId === op.programId) return { ok: false, error: '현재 행사에서는 가져올 수 없습니다.' };
  const admin = createAdminClient();
  const { data: allowed } = await admin.from('program_members').select('id').eq('user_id', op.id).eq('program_id', sourceProgramId).eq('role', 'nextlab').eq('is_active', true).maybeSingle();
  if (!allowed) return { ok: false, error: '원천 행사의 운영사 담당자만 멘토를 가져올 수 있습니다.' };
  // 원천 행사에서 실제로 활성 멘토인 계정만 (임의 user id 차단)
  const { data: srcMembers } = await admin.from('program_members').select('user_id').eq('program_id', sourceProgramId).eq('role', 'mentor').eq('is_active', true).in('user_id', ids);
  const valid = (srcMembers ?? []).map((m) => m.user_id);
  const skipped = ids.length - valid.length;
  if (valid.length === 0) return { ok: false, error: '원천 행사의 멘토가 아닌 계정입니다.' };
  const { data: existing } = await admin.from('program_members').select('user_id, role, is_active').eq('program_id', op.programId).in('user_id', valid);
  const existingMap = new Map((existing ?? []).map((e) => [e.user_id, e]));
  let added = 0;
  let alreadyMember = 0;
  for (const uid of valid) {
    const cur = existingMap.get(uid);
    if (cur?.is_active && cur.role === 'mentor') {
      alreadyMember += 1;
      continue;
    }
    if (cur?.is_active && cur.role !== 'mentor') {
      // 이 행사에서 다른 역할(발주처·운영사·멘티)로 활성 소속인 계정은 역할을 바꾸지 않는다
      alreadyMember += 1;
      continue;
    }
    const { error } = await admin.from('program_members').upsert({ program_id: op.programId, user_id: uid, role: 'mentor', is_active: true, grade: null, left_at: null }, { onConflict: 'program_id,user_id' });
    if (error) return { ok: false, error: `소속 추가 실패: ${error.message}` };
    added += 1;
  }
  // 프로필 복사 — 현재 행사에 이미 프로필이 있으면 유지(덮어쓰지 않음)
  const [{ data: srcProfiles }, { data: dstProfiles }] = await Promise.all([
    admin.from('mentor_profiles').select('*').eq('program_id', sourceProgramId).in('user_id', valid),
    admin.from('mentor_profiles').select('user_id').eq('program_id', op.programId).in('user_id', valid),
  ]);
  const has = new Set((dstProfiles ?? []).map((p) => p.user_id));
  const toCopy = (srcProfiles ?? []).filter((p) => !has.has(p.user_id));
  let profilesCopied = 0;
  if (toCopy.length) {
    const { error } = await admin.from('mentor_profiles').upsert(
      toCopy.map((p) => ({ program_id: op.programId, user_id: p.user_id, bio: p.bio, career: p.career, expertise: p.expertise, industries: p.industries, keywords: p.keywords, regions: p.regions, stages: p.stages, modes: p.modes, capacity: p.capacity, mentor_institution: p.mentor_institution, note: p.note })),
      { onConflict: 'program_id,user_id' },
    );
    if (error) console.error('mentor profile copy failed:', error.message);
    else profilesCopied = toCopy.length;
  }
  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: op.id,
    program_id: op.programId,
    action: 'membership.import_from_program',
    entity_type: 'programs',
    entity_id: op.programId,
    metadata: { source_program_id: sourceProgramId, requested: ids.length, added, already_member: alreadyMember, profiles_copied: profilesCopied, skipped, user_ids: valid },
  });
  if (auditError) console.error('membership.import_from_program audit insert failed:', auditError.message);
  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/members');
  revalidatePath('/nextlab/dashboard');
  return { ok: true, added, alreadyMember, profilesCopied, skipped };
}
