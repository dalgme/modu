'use server';

import { revalidatePath } from 'next/cache';

import { getRealSessionProfile, realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { getImpersonation } from '@/lib/auth/impersonation';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { reauthenticate } from '@/lib/sms/reauth';
import type { Json } from '@/types/database';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const OPERATOR_ONLY = '운영사 담당자만 실행할 수 있습니다.';

async function operator(): Promise<{ id: string; email: string | null; programId: string } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'mentors.docs');
  if (denied) return { error: denied };
  return { id: profile.id, email: profile.email, programId: ctx.programId };
}

async function mentorsInProgram(programId: string, userIds: string[]): Promise<boolean> {
  const { data } = await createAdminClient().from('program_members').select('user_id').eq('program_id', programId).in('user_id', userIds);
  return (data ?? []).length === new Set(userIds).size;
}

/**
 * 멘토 지급서류 수령 체크 (docs §15) — 다중 멘토 일괄, **비밀번호 재인증 필수**, 대행(view-as) 중 불가.
 * fields 에 true 면 수령(now), false 면 미수령(null), undefined 면 변경 없음.
 */
export async function checkPaymentDocsAction(input: { userIds: string[]; fields: { resume?: boolean; bankbook?: boolean; idCard?: boolean }; note?: string; password: string }): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  if (await getImpersonation()) return { ok: false, error: '대행(view-as) 중에는 지급서류 체크를 할 수 없습니다.' };
  const real = await getRealSessionProfile();
  if (!real) return { ok: false, error: '로그인이 필요합니다.' };
  const ids = Array.from(new Set(input.userIds ?? []));
  if (ids.length === 0) return { ok: false, error: '멘토를 선택하세요.' };
  if (!(await mentorsInProgram(op.programId, ids))) return { ok: false, error: '이 행사의 멘토가 아닌 항목이 있습니다.' };
  const re = await reauthenticate({ id: real.id, email: real.email }, input.password ?? '');
  if (!re.ok) return { ok: false, error: re.error };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: existing } = await admin.from('mentor_payment_docs').select('*').eq('program_id', op.programId).in('user_id', ids);
  const byUser = new Map((existing ?? []).map((d) => [d.user_id, d]));
  const patch: Record<string, string | null> = {};
  if (input.fields.resume !== undefined) { patch.resume_received_at = input.fields.resume ? now : null; patch.resume_state = input.fields.resume ? 'O' : null; }
  if (input.fields.bankbook !== undefined) { patch.bankbook_received_at = input.fields.bankbook ? now : null; patch.bankbook_state = input.fields.bankbook ? 'O' : null; }
  if (input.fields.idCard !== undefined) { patch.id_card_received_at = input.fields.idCard ? now : null; patch.id_card_state = input.fields.idCard ? 'O' : null; }
  if (Object.keys(patch).length === 0 && input.note === undefined) return { ok: false, error: '변경할 항목을 선택하세요.' };

  for (const uid of ids) {
    const before = byUser.get(uid) ?? null;
    const row = { program_id: op.programId, user_id: uid, checked_by: op.id, ...patch, ...(input.note !== undefined ? { note: input.note.trim() || null } : {}) };
    const { error } = await admin.from('mentor_payment_docs').upsert(row, { onConflict: 'program_id,user_id' });
    if (error) return { ok: false, error: error.message };
    await admin.from('audit_logs').insert({
      actor_id: op.id,
      program_id: op.programId,
      action: 'mentor.payment_doc_check',
      entity_type: 'users',
      entity_id: uid,
      metadata: { before: before ? { resume: before.resume_received_at, bankbook: before.bankbook_received_at, id_card: before.id_card_received_at } : null, after: patch, reauth: true } as Json,
    });
  }
  revalidatePath('/nextlab/mentors');
  revalidatePath('/nextlab/settlements');
  return { ok: true, message: `${ids.length}명의 지급서류 수령 상태를 저장했습니다.` };
}

/** 그룹 내 멘토별 원천징수 방식 (support_type_members.withholding_method) */
export async function setMentorGroupWithholdingAction(supportTypeId: string, userId: string, method: 'other_income' | 'business_income' | 'none' | ''): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: g } = await admin.from('support_types').select('program_id').eq('id', supportTypeId).maybeSingle();
  if (!g || g.program_id !== op.programId) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
  const { data: before } = await admin.from('support_type_members').select('withholding_method').eq('support_type_id', supportTypeId).eq('user_id', userId).maybeSingle();
  const { error } = await admin.from('support_type_members').upsert({ support_type_id: supportTypeId, user_id: userId, member_role: 'mentor', is_active: true, withholding_method: method || null }, { onConflict: 'support_type_id,user_id' });
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({ actor_id: op.id, program_id: op.programId, action: 'settings.update', entity_type: 'support_type_members', entity_id: userId, metadata: { key: 'mentor_withholding', support_type_id: supportTypeId, before: before?.withholding_method ?? null, after: method || null } });
  revalidatePath('/nextlab/mentors');
  return { ok: true };
}

/** 그룹별 멘토 운영사 평가·메모 (docs §20) — append-only, 멘토 본인 비공개 */
export async function addMentorGroupReviewAction(input: { supportTypeId: string; mentorId: string; rating?: number | null; memo?: string; tags?: string[] }): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const rating = input.rating ?? null;
  const memo = (input.memo ?? '').trim();
  if (rating === null && !memo) return { ok: false, error: '평점 또는 메모를 입력하세요.' };
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return { ok: false, error: '평점은 1~5 입니다.' };
  const admin = createAdminClient();
  const { data: g } = await admin.from('support_types').select('program_id').eq('id', input.supportTypeId).maybeSingle();
  if (!g || g.program_id !== op.programId) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
  const { error } = await admin.from('mentor_group_reviews').insert({ program_id: op.programId, support_type_id: input.supportTypeId, mentor_id: input.mentorId, author_id: op.id, rating, memo: memo || null, tags: (input.tags ?? []).slice(0, 10) });
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({ actor_id: op.id, program_id: op.programId, action: 'mentor.group_review', entity_type: 'users', entity_id: input.mentorId, metadata: { support_type_id: input.supportTypeId, rating, memo_len: memo.length } });
  revalidatePath('/nextlab/mentors');
  return { ok: true };
}

export async function deleteMentorGroupReviewAction(id: string): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: row } = await admin.from('mentor_group_reviews').select('id, program_id').eq('id', id).maybeSingle();
  if (!row || row.program_id !== op.programId) return { ok: false, error: '이 행사의 기록이 아닙니다.' };
  await admin.from('mentor_group_reviews').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/nextlab/mentors');
  return { ok: true };
}

/** 그룹별 담당역할 메모 (support_type_members.duty) */
export async function setMentorGroupDutyAction(supportTypeId: string, userId: string, duty: string): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: g } = await admin.from('support_types').select('program_id').eq('id', supportTypeId).maybeSingle();
  if (!g || g.program_id !== op.programId) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
  const { error } = await admin.from('support_type_members').upsert({ support_type_id: supportTypeId, user_id: userId, member_role: 'mentor', is_active: true, duty: duty.trim() || null }, { onConflict: 'support_type_id,user_id' });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/nextlab/mentors');
  return { ok: true };
}

/** 멘토 그룹 지정/해제 (P25) — 지정이 하나라도 있으면 그 그룹에서만 매칭 후보, 없으면 모든 그룹에서 사용 */
export async function setMentorGroupMembershipAction(supportTypeId: string, userId: string, active: boolean): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const [{ data: g }, { data: member }] = await Promise.all([
    admin.from('support_types').select('program_id, name').eq('id', supportTypeId).maybeSingle(),
    admin.from('program_members').select('role').eq('program_id', op.programId).eq('user_id', userId).maybeSingle(),
  ]);
  if (!g || g.program_id !== op.programId) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
  if (!member || member.role !== 'mentor') return { ok: false, error: '이 행사의 멘토가 아닙니다.' };
  if (!active) {
    // 이 그룹에 활성 배정이 있으면 지정 해제 불가 — 배정 해제/재배정이 먼저
    const { count } = await admin
      .from('mentor_assignments')
      .select('id, cases!inner(support_type_id)', { count: 'exact', head: true })
      .eq('mentor_id', userId)
      .eq('is_active', true)
      .eq('cases.support_type_id', supportTypeId);
    if ((count ?? 0) > 0) return { ok: false, error: `이 그룹에 담당 멘티 ${count}명이 있어 지정을 해제할 수 없습니다. 먼저 배정을 해제·재배정하세요.` };
  }
  const { error } = await admin
    .from('support_type_members')
    .upsert({ support_type_id: supportTypeId, user_id: userId, member_role: 'mentor', is_active: active, left_at: active ? null : new Date().toISOString() }, { onConflict: 'support_type_id,user_id' });
  if (error) return { ok: false, error: error.message };
  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: op.id,
    program_id: op.programId,
    action: active ? 'mentor.group_assign' : 'mentor.group_unassign',
    entity_type: 'users',
    entity_id: userId,
    metadata: { support_type_id: supportTypeId, group_name: g.name },
  });
  if (auditError) console.error('mentor group membership audit failed:', auditError.message);
  revalidatePath('/nextlab/roster');
  return { ok: true };
}

/**
 * 지급서류 수령 상태 O/X 버튼 (P25-17) — 기본 '-'. 비밀번호 재인증 필수(원본 규칙 유지, 대행 불가).
 * O 로 바꾸면 수령 시각도 기록, '-'/X 는 수령 시각을 지운다.
 */
export async function setPaymentDocStateAction(input: { userId: string; kind: 'resume' | 'bankbook' | 'idCard'; state: '-' | 'O' | 'X'; password: string }): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  if (await getImpersonation()) return { ok: false, error: '대행 중에는 지급서류 상태를 바꿀 수 없습니다.' };
  const real = await getRealSessionProfile();
  if (!real) return { ok: false, error: '로그인이 필요합니다.' };
  const reauth = await reauthenticate({ id: real.id, email: real.email }, input.password ?? '');
  if (!reauth.ok) return { ok: false, error: reauth.error };
  const admin = createAdminClient();
  const { data: member } = await admin.from('program_members').select('role').eq('program_id', op.programId).eq('user_id', input.userId).maybeSingle();
  if (!member || member.role !== 'mentor') return { ok: false, error: '이 행사의 멘토가 아닙니다.' };
  const now = new Date().toISOString();
  const state = input.state === '-' ? null : input.state;
  const receivedAt = input.state === 'O' ? now : null;
  const patch =
    input.kind === 'resume'
      ? { resume_state: state, resume_received_at: receivedAt }
      : input.kind === 'bankbook'
        ? { bankbook_state: state, bankbook_received_at: receivedAt }
        : { id_card_state: state, id_card_received_at: receivedAt };
  const { error } = await admin
    .from('mentor_payment_docs')
    .upsert({ program_id: op.programId, user_id: input.userId, checked_by: op.id, ...patch }, { onConflict: 'program_id,user_id' });
  if (error) return { ok: false, error: error.message };
  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: op.id,
    program_id: op.programId,
    action: 'mentor.payment_doc_state',
    entity_type: 'users',
    entity_id: input.userId,
    metadata: { kind: input.kind, state: input.state },
  });
  if (auditError) console.error('payment doc state audit failed:', auditError.message);
  revalidatePath('/nextlab/roster');
  return { ok: true };
}
