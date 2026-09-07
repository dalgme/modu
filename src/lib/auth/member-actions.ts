'use server';

import { revalidatePath } from 'next/cache';

import { requireNextlab } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createStaffOrMentorAccount,
  inviteMentee,
  phoneTempPassword,
} from '@/lib/auth/admin-accounts';
import { createAccountSchema, inviteMenteeSchema } from '@/lib/validations/auth';

/** 계정 발급·비밀번호 재설정 결과 (임시 비밀번호 1회 노출) */
export type MemberActionState =
  | { ok: true; message: string; email?: string; tempPassword?: string }
  | { ok: false; error: string }
  | undefined;

/**
 * 회원 계정 발급 (운영사 총괄관리자 전용).
 * 발주처·운영사·멘토 계정을 발급한다. 멘티는 케이스 등록 후 초대 플로우로만 생성된다.
 */
export async function createMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();

  const parsed = createAccountSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    phone: formData.get('phone') || undefined,
    role: formData.get('role'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }

  try {
    const result = await createStaffOrMentorAccount({ ...parsed.data, actorId: actor.id });
    revalidatePath('/nextlab/members');
    return {
      ok: true,
      message: '계정이 발급되었습니다. 아래 임시 비밀번호를 회원에게 전달하세요.',
      email: result.email,
      tempPassword: result.tempPassword,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : '계정 발급에 실패했습니다.';
    return { ok: false, error: message };
  }
}

/**
 * 멘티 초대 (운영사 전용). 케이스에 멘티 계정을 발급하고 mentee_id 를 연결한다.
 * 이미 멘티가 연결된 케이스는 중복 초대를 막는다. 임시 비밀번호를 1회 노출한다.
 */
export async function inviteMenteeAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();

  const parsed = inviteMenteeSchema.safeParse({
    caseId: formData.get('caseId'),
    email: formData.get('email'),
    name: formData.get('name'),
    phone: formData.get('phone') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }

  const admin = createAdminClient();
  // 중복 초대 방지: 이미 멘티가 연결된 케이스면 차단
  const { data: existing } = await admin
    .from('cases')
    .select('mentee_id')
    .eq('id', parsed.data.caseId)
    .maybeSingle();
  if (!existing) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  if (existing.mentee_id) {
    return { ok: false, error: '이미 멘티 계정이 연결된 케이스입니다.' };
  }

  try {
    const result = await inviteMentee({ ...parsed.data, actorId: actor.id });
    revalidatePath(`/nextlab/cases/${parsed.data.caseId}`);
    revalidatePath('/nextlab/members');
    return {
      ok: true,
      message: '멘티 계정을 발급했습니다. 아래 임시 비밀번호를 멘티에게 전달하세요.',
      email: result.email,
      tempPassword: result.tempPassword,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : '멘티 초대에 실패했습니다.';
    return { ok: false, error: message };
  }
}

/**
 * 회원 활성/비활성 전환. 비활성 계정은 로그인이 차단된다(requireUser 가드).
 */
export async function setMemberActiveAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();
  const userId = String(formData.get('userId') ?? '');
  const active = String(formData.get('active') ?? '') === 'true';

  if (!userId) return { ok: false, error: '대상 회원을 확인할 수 없습니다.' };
  if (userId === actor.id) return { ok: false, error: '본인 계정은 비활성화할 수 없습니다.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('users')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) return { ok: false, error: '상태 변경에 실패했습니다.' };

  await admin.from('audit_logs').insert({
    actor_id: actor.id,
    action: active ? 'account.activate' : 'account.deactivate',
    entity_type: 'users',
    entity_id: userId,
    metadata: {},
  });

  revalidatePath('/nextlab/members');
  return { ok: true, message: active ? '계정을 활성화했습니다.' : '계정을 비활성화했습니다.' };
}

/**
 * 회원 영구 삭제 (운영사 총괄관리자 전용).
 * auth 계정을 삭제하면 public.users 프로필이 CASCADE 로 함께 제거된다.
 * 단, 케이스·배정·멘토링 이력이 연결된 회원은 데이터 무결성을 위해 삭제를 막고
 * 비활성화를 안내한다. (감사로그 actor_id 는 ON DELETE SET NULL 이라 보존됨)
 */
export async function deleteMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();
  const userId = String(formData.get('userId') ?? '');
  if (!userId) return { ok: false, error: '대상 회원을 확인할 수 없습니다.' };
  if (userId === actor.id) return { ok: false, error: '본인 계정은 삭제할 수 없습니다.' };

  const admin = createAdminClient();

  // 참조 무결성 사전 점검 (RESTRICT FK + 케이스 고아 방지)
  const [createdCases, menteeCases, mentorAssigns, mentorLogs] = await Promise.all([
    admin.from('cases').select('id', { count: 'exact', head: true }).eq('created_by', userId),
    admin.from('cases').select('id', { count: 'exact', head: true }).eq('mentee_id', userId),
    admin
      .from('mentor_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('mentor_id', userId),
    admin.from('mentoring_logs').select('id', { count: 'exact', head: true }).eq('mentor_id', userId),
  ]);
  const linked =
    (createdCases.count ?? 0) +
    (menteeCases.count ?? 0) +
    (mentorAssigns.count ?? 0) +
    (mentorLogs.count ?? 0);
  if (linked > 0) {
    return {
      ok: false,
      error: '케이스·멘토 배정·멘토링 이력이 연결된 회원은 삭제할 수 없습니다. 대신 비활성화하세요.',
    };
  }

  // 삭제 전 프로필 정보 확보 (감사로그 metadata 용)
  const { data: member } = await admin
    .from('users')
    .select('email, name, role')
    .eq('id', userId)
    .maybeSingle();

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return { ok: false, error: '회원 삭제에 실패했습니다. 연결된 데이터가 있을 수 있습니다.' };
  }

  await admin.from('audit_logs').insert({
    actor_id: actor.id,
    action: 'account.delete',
    entity_type: 'users',
    entity_id: userId,
    metadata: member ? { email: member.email, name: member.name, role: member.role } : {},
  });

  revalidatePath('/nextlab/members');
  return { ok: true, message: '회원을 삭제했습니다.' };
}

/**
 * 회원 임시 비밀번호 재발급. 최초 로그인 시 비밀번호 변경을 다시 강제한다.
 */
export async function resetMemberPasswordAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();
  const userId = String(formData.get('userId') ?? '');
  if (!userId) return { ok: false, error: '대상 회원을 확인할 수 없습니다.' };

  const admin = createAdminClient();
  const { data: member } = await admin
    .from('users')
    .select('phone')
    .eq('id', userId)
    .maybeSingle();
  const tempPassword = phoneTempPassword(member?.phone);

  const { error: pwError } = await admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
  });
  if (pwError) return { ok: false, error: '비밀번호 재설정에 실패했습니다.' };

  const { error: flagError } = await admin
    .from('users')
    .update({ must_change_password: true, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (flagError) return { ok: false, error: '프로필 갱신에 실패했습니다.' };

  await admin.from('audit_logs').insert({
    actor_id: actor.id,
    action: 'account.reset_password',
    entity_type: 'users',
    entity_id: userId,
    metadata: {},
  });

  revalidatePath('/nextlab/members');
  return {
    ok: true,
    message: '임시 비밀번호를 재발급했습니다. 회원에게 전달하세요.',
    tempPassword,
  };
}
