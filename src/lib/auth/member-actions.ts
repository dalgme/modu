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
import { contextOrNull } from '@/lib/programs/context';
import { resolveUserByIdentifier, toStoredPhone } from '@/lib/auth/identifier';
import { LOGIN_GUIDE_SMS_ACTION } from '@/lib/data/members';
import { resolveSmsCredentials } from '@/lib/sms/secrets';
import { sendSolapiSms } from '@/lib/notifications/solapi';
import type { UserRole } from '@/lib/auth/roles';
import { denyUnless, isStaffGrade } from '@/lib/auth/capabilities';


const ALL_ROLES: UserRole[] = ['institution', 'nextlab', 'mentor', 'mentee'];

/** 현재 행사 컨텍스트 (없으면 null) — 회원관리는 항상 행사 범위 안에서 동작한다 (설계 B) */
async function currentProgramId(actor: Parameters<typeof contextOrNull>[0]): Promise<string | null> {
  const ctx = await contextOrNull(actor);
  return ctx?.programId ?? null;
}

/** 담당 등급 권한 검사 — 없으면 안내 문구 */
async function deniedFor(actor: Parameters<typeof contextOrNull>[0], key: 'members' | 'members.sensitive'): Promise<string | null> {
  const ctx = await contextOrNull(actor);
  if (!ctx) return '행사를 먼저 선택하세요.';
  return denyUnless(ctx, key);
}

/** 대상이 이 행사의 소속인지 (운영사 회원관리 액션의 범위 강제) */
async function assertMemberOfProgram(programId: string, userId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('program_members').select('id').eq('program_id', programId).eq('user_id', userId).maybeSingle();
  return !!data;
}

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
  { const denied = await deniedFor(actor, 'members'); if (denied) return { ok: false, error: denied }; }

  const parsed = createAccountSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    phone: formData.get('phone') || undefined,
    role: formData.get('role'),
    position: formData.get('position') || undefined,
    organization: formData.get('organization') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }
  const gradeRaw = String(formData.get('grade') ?? '');
  const grade = parsed.data.role === 'nextlab' && isStaffGrade(gradeRaw) ? gradeRaw : null;
  const duty = String(formData.get('duty') ?? '').trim() || null;

  const programId = await currentProgramId(actor);
  if (!programId) return { ok: false, error: '행사를 먼저 선택하세요.' };

  try {
    const result = await createStaffOrMentorAccount({ ...parsed.data, actorId: actor.id });
    // 이 행사 소속 + 행사 안 역할 (설계 B) + 운영사 등급·담당
    await createAdminClient()
      .from('program_members')
      .upsert({ program_id: programId, user_id: result.userId, role: parsed.data.role, grade, duty, is_active: true, left_at: null }, { onConflict: 'program_id,user_id' });
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
  { const denied = await deniedFor(actor, 'members'); if (denied) return { ok: false, error: denied }; }

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
  { const denied = await deniedFor(actor, 'members.sensitive'); if (denied) return { ok: false, error: denied }; }
  const userId = String(formData.get('userId') ?? '');
  const active = String(formData.get('active') ?? '') === 'true';

  if (!userId) return { ok: false, error: '대상 회원을 확인할 수 없습니다.' };
  if (userId === actor.id) return { ok: false, error: '본인 계정은 비활성화할 수 없습니다.' };
  const programId = await currentProgramId(actor);
  if (!programId || !(await assertMemberOfProgram(programId, userId))) return { ok: false, error: '이 행사 소속 회원이 아닙니다.' };

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
  { const denied = await deniedFor(actor, 'members.sensitive'); if (denied) return { ok: false, error: denied }; }
  const userId = String(formData.get('userId') ?? '');
  if (!userId) return { ok: false, error: '대상 회원을 확인할 수 없습니다.' };
  if (userId === actor.id) return { ok: false, error: '본인 계정은 삭제할 수 없습니다.' };
  const programId = await currentProgramId(actor);
  if (!programId || !(await assertMemberOfProgram(programId, userId))) return { ok: false, error: '이 행사 소속 회원이 아닙니다.' };
  // 다른 행사에도 소속된 계정은 삭제 대신 이 행사 소속 해제로 유도
  const { count: otherPrograms } = await createAdminClient().from('program_members').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('program_id', programId);
  if ((otherPrograms ?? 0) > 0) return { ok: false, error: '다른 행사에도 소속된 계정입니다. 삭제 대신 [소속 해제]를 사용하세요.' };

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
  { const denied = await deniedFor(actor, 'members.sensitive'); if (denied) return { ok: false, error: denied }; }
  const userId = String(formData.get('userId') ?? '');
  if (!userId) return { ok: false, error: '대상 회원을 확인할 수 없습니다.' };
  const programId = await currentProgramId(actor);
  if (!programId || !(await assertMemberOfProgram(programId, userId))) return { ok: false, error: '이 행사 소속 회원이 아닙니다.' };

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

/**
 * 기존 계정을 이 행사에 추가 (설계 B — 같은 사람이 행사마다 다른 역할을 가질 수 있다).
 * 식별자(이메일·휴대폰·멘티 아이디)로 계정을 찾아 program_members 에 역할과 함께 소속시킨다. 새 계정은 만들지 않는다.
 */
export async function addExistingMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();
  { const denied = await deniedFor(actor, 'members'); if (denied) return { ok: false, error: denied }; }
  const programId = await currentProgramId(actor);
  if (!programId) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const identifier = String(formData.get('identifier') ?? '').trim();
  const role = String(formData.get('role') ?? '') as UserRole;
  if (!identifier) return { ok: false, error: '이메일·휴대폰·아이디를 입력하세요.' };
  if (!ALL_ROLES.includes(role)) return { ok: false, error: '역할을 선택하세요.' };

  const found = await resolveUserByIdentifier(identifier);
  if (found === 'ambiguous') return { ok: false, error: '여러 계정이 일치합니다. 이메일로 지정하세요.' };
  if (!found) return { ok: false, error: '해당 계정을 찾을 수 없습니다. 새 계정은 위의 발급 폼을 사용하세요.' };

  const admin = createAdminClient();
  const { data: target } = await admin.from('users').select('is_platform_admin').eq('id', found.id).maybeSingle();
  if (target?.is_platform_admin) return { ok: false, error: '플랫폼 관리자 계정은 통합관리 전용이라 행사에 소속시킬 수 없습니다.' };
  const { data: existing } = await admin.from('program_members').select('id, role, is_active').eq('program_id', programId).eq('user_id', found.id).maybeSingle();
  if (existing?.is_active && existing.role === role) return { ok: false, error: '이미 이 행사에 같은 역할로 소속되어 있습니다.' };
  const { error } = await admin
    .from('program_members')
    .upsert({ program_id: programId, user_id: found.id, role, is_active: true, left_at: null, joined_at: new Date().toISOString() }, { onConflict: 'program_id,user_id' });
  if (error) return { ok: false, error: error.message };

  await admin.from('audit_logs').insert({
    actor_id: actor.id,
    program_id: programId,
    action: existing ? 'membership.update' : 'membership.add',
    entity_type: 'users',
    entity_id: found.id,
    metadata: { role, previous_role: existing?.role ?? null, identifier: identifier.includes('@') ? identifier : null },
  });
  revalidatePath('/nextlab/members');
  return { ok: true, message: `이 행사에 ${role === 'mentee' ? '멘티' : role === 'mentor' ? '멘토' : role === 'nextlab' ? '운영사' : '발주처'} 역할로 추가했습니다.` };
}

/** 이 행사 안에서의 역할 변경 (계정 기본 역할은 바뀌지 않는다) */
export async function setMemberRoleAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();
  { const denied = await deniedFor(actor, 'members'); if (denied) return { ok: false, error: denied }; }
  const programId = await currentProgramId(actor);
  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '') as UserRole;
  if (!programId || !userId || !(await assertMemberOfProgram(programId, userId))) return { ok: false, error: '이 행사 소속 회원이 아닙니다.' };
  if (!ALL_ROLES.includes(role)) return { ok: false, error: '역할을 선택하세요.' };
  if (userId === actor.id) return { ok: false, error: '본인 역할은 바꿀 수 없습니다.' };
  const admin = createAdminClient();
  const { data: prev } = await admin.from('program_members').select('role').eq('program_id', programId).eq('user_id', userId).maybeSingle();
  const { error } = await admin.from('program_members').update({ role }).eq('program_id', programId).eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({ actor_id: actor.id, program_id: programId, action: 'membership.role', entity_type: 'users', entity_id: userId, metadata: { role, previous_role: prev?.role ?? null } });
  revalidatePath('/nextlab/members');
  return { ok: true, message: '이 행사에서의 역할을 변경했습니다.' };
}

/** 이 행사 소속 해제 — 계정은 남기고 멤버십만 비활성(이력 보존). 다른 행사 활동에는 영향 없음. */
export async function removeMemberFromProgramAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();
  { const denied = await deniedFor(actor, 'members'); if (denied) return { ok: false, error: denied }; }
  const programId = await currentProgramId(actor);
  const userId = String(formData.get('userId') ?? '');
  if (!programId || !userId || !(await assertMemberOfProgram(programId, userId))) return { ok: false, error: '이 행사 소속 회원이 아닙니다.' };
  if (userId === actor.id) return { ok: false, error: '본인 소속은 해제할 수 없습니다.' };
  const admin = createAdminClient();
  const { count: activeAssign } = await admin.from('mentor_assignments').select('id, cases!inner(program_id)', { count: 'exact', head: true }).eq('mentor_id', userId).eq('is_active', true).eq('cases.program_id', programId);
  if ((activeAssign ?? 0) > 0) return { ok: false, error: '이 행사에서 활성 배정이 있는 멘토입니다. 먼저 배정을 교체·회수하세요.' };
  const { error } = await admin.from('program_members').update({ is_active: false, left_at: new Date().toISOString() }).eq('program_id', programId).eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({ actor_id: actor.id, program_id: programId, action: 'membership.remove', entity_type: 'users', entity_id: userId, metadata: {} });
  revalidatePath('/nextlab/members');
  return { ok: true, message: '이 행사 소속을 해제했습니다.' };
}

/**
 * 회원 정보 수정 (운영사) — 이름·휴대폰·이메일·소속과, 담당자의 직위·담당역할·운영사 등급.
 * 멘티·멘토 정보도 운영사 담당자가 여기서 고친다. 이메일 변경은 로그인 아이디 변경이라 auth 에도 반영한다.
 * 등급은 역할이 운영사일 때만 의미가 있다. 본인 등급은 낮출 수 없다(잠금 방지).
 */
export async function updateMemberDetailsAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();
  { const denied = await deniedFor(actor, 'members'); if (denied) return { ok: false, error: denied }; }
  const programId = await currentProgramId(actor);
  const userId = String(formData.get('userId') ?? '');
  if (!programId || !userId || !(await assertMemberOfProgram(programId, userId))) return { ok: false, error: '이 행사 소속 회원이 아닙니다.' };
  const name = String(formData.get('name') ?? '').trim();
  const phoneRaw = String(formData.get('phone') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const organization = String(formData.get('organization') ?? '').trim() || null;
  const position = String(formData.get('position') ?? '').trim() || null;
  const duty = String(formData.get('duty') ?? '').trim() || null;
  const gradeRaw = String(formData.get('grade') ?? '');
  if (!name) return { ok: false, error: '이름을 입력하세요.' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: '이메일 형식을 확인하세요.' };
  const phone = phoneRaw ? toStoredPhone(phoneRaw) : null;
  if (phoneRaw && !phone) return { ok: false, error: '휴대폰 번호 형식을 확인하세요.' };

  const admin = createAdminClient();
  const { data: mem } = await admin.from('program_members').select('role, grade').eq('program_id', programId).eq('user_id', userId).maybeSingle();
  const { data: current } = await admin.from('users').select('email, phone, name').eq('id', userId).maybeSingle();
  if (!current) return { ok: false, error: '회원을 찾을 수 없습니다.' };
  const grade = mem?.role === 'nextlab' ? (isStaffGrade(gradeRaw) ? gradeRaw : null) : null;
  if (userId === actor.id && mem?.role === 'nextlab' && grade !== (mem.grade ?? null) && grade !== null && grade !== 'pl') {
    return { ok: false, error: '본인 등급은 낮출 수 없습니다. 다른 메인 담당자가 변경해야 합니다.' };
  }
  if ((mem?.role === 'institution' || mem?.role === 'nextlab') && !position) return { ok: false, error: '발주처·운영사 담당자는 직위를 입력하세요.' };

  // 이메일 변경 = 로그인 아이디 변경 → 중복 확인 후 auth 에 먼저 반영
  if (email && email !== (current.email ?? '').toLowerCase()) {
    const { data: dup } = await admin.from('users').select('id').eq('email', email).neq('id', userId).maybeSingle();
    if (dup) return { ok: false, error: '이미 다른 계정이 쓰는 이메일입니다.' };
    const { error: authError } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (authError) return { ok: false, error: `이메일 변경 실패: ${authError.message}` };
  }
  if (phone && phone !== current.phone) {
    const { data: dup } = await admin.from('users').select('id').eq('phone', phone).neq('id', userId).maybeSingle();
    if (dup) return { ok: false, error: '이미 다른 계정이 쓰는 휴대폰 번호입니다.' };
  }

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    admin.from('users').update({ name, phone: phone ?? current.phone, email: email || current.email, organization, position, updated_at: new Date().toISOString() }).eq('id', userId),
    admin.from('program_members').update({ duty, grade }).eq('program_id', programId).eq('user_id', userId),
  ]);
  if (e1 || e2) return { ok: false, error: (e1 ?? e2)!.message };
  await admin.from('audit_logs').insert({
    actor_id: actor.id,
    program_id: programId,
    action: grade !== (mem?.grade ?? null) ? 'membership.grade' : 'membership.profile',
    entity_type: 'users',
    entity_id: userId,
    metadata: { name, position, duty, grade, organization, previous_grade: mem?.grade ?? null, email_changed: email !== (current.email ?? '').toLowerCase() && !!email, phone_changed: !!phone && phone !== current.phone },
  });
  revalidatePath('/nextlab/members');
  revalidatePath('/', 'layout');
  return { ok: true, message: '회원 정보를 저장했습니다.' };
}

/* ── 임의 컬럼 (멘티·멘토 리스트 카테고리 마크) ─────────────────────────── */

/** 임의 컬럼이 붙는 리스트 (멘티·멘토 한정) */
const ROSTER_TARGETS: UserRole[] = ['mentee', 'mentor'];
const MAX_ROSTER_COLUMNS = 8;

/** 컬럼이 이 행사 소속인지 확인하고 target 을 돌려준다 */
async function rosterColumnOf(programId: string, columnId: string): Promise<{ id: string; target: string; name: string } | null> {
  const { data } = await createAdminClient().from('roster_columns').select('id, target, name').eq('id', columnId).eq('program_id', programId).maybeSingle();
  return data ?? null;
}

/** 임의 컬럼 추가 — 멘티/멘토 리스트별 최대 8개 */
export async function addRosterColumnAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();
  { const denied = await deniedFor(actor, 'members'); if (denied) return { ok: false, error: denied }; }
  const programId = await currentProgramId(actor);
  if (!programId) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const target = String(formData.get('target') ?? '') as UserRole;
  const name = String(formData.get('name') ?? '').trim();
  if (!ROSTER_TARGETS.includes(target)) return { ok: false, error: '멘티 또는 멘토 리스트를 선택하세요.' };
  if (!name || name.length > 30) return { ok: false, error: '컬럼 이름은 1~30자로 입력하세요.' };
  const admin = createAdminClient();
  const { count } = await admin.from('roster_columns').select('id', { count: 'exact', head: true }).eq('program_id', programId).eq('target', target);
  if ((count ?? 0) >= MAX_ROSTER_COLUMNS) return { ok: false, error: `임의 컬럼은 리스트당 최대 ${MAX_ROSTER_COLUMNS}개입니다.` };
  const { data: inserted, error } = await admin.from('roster_columns').insert({ program_id: programId, target, name, sort_order: (count ?? 0) + 1, created_by: actor.id }).select('id').single();
  if (error) return { ok: false, error: error.code === '23505' ? '같은 이름의 컬럼이 이미 있습니다.' : error.message };
  await admin.from('audit_logs').insert({ actor_id: actor.id, program_id: programId, action: 'roster.column_add', entity_type: 'roster_columns', entity_id: inserted.id, metadata: { target, name } });
  revalidatePath('/nextlab/members');
  return { ok: true, message: `'${name}' 컬럼을 추가했습니다.` };
}

/** 임의 컬럼 삭제 — 값도 함께 삭제된다 */
export async function deleteRosterColumnAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();
  { const denied = await deniedFor(actor, 'members'); if (denied) return { ok: false, error: denied }; }
  const programId = await currentProgramId(actor);
  const columnId = String(formData.get('columnId') ?? '');
  if (!programId || !columnId) return { ok: false, error: '컬럼을 확인할 수 없습니다.' };
  const col = await rosterColumnOf(programId, columnId);
  if (!col) return { ok: false, error: '이 행사의 컬럼이 아닙니다.' };
  const { error } = await createAdminClient().from('roster_columns').delete().eq('id', columnId);
  if (error) return { ok: false, error: error.message };
  await createAdminClient().from('audit_logs').insert({ actor_id: actor.id, program_id: programId, action: 'roster.column_delete', entity_type: 'roster_columns', entity_id: columnId, metadata: { target: col.target, name: col.name } });
  revalidatePath('/nextlab/members');
  return { ok: true, message: `'${col.name}' 컬럼을 삭제했습니다.` };
}

/** 임의 컬럼 값 저장 — 빈 값이면 지운다 */
export async function setRosterValueAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();
  { const denied = await deniedFor(actor, 'members'); if (denied) return { ok: false, error: denied }; }
  const programId = await currentProgramId(actor);
  const columnId = String(formData.get('columnId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const value = String(formData.get('value') ?? '').trim().slice(0, 60);
  if (!programId || !columnId || !userId) return { ok: false, error: '대상을 확인할 수 없습니다.' };
  if (!(await rosterColumnOf(programId, columnId))) return { ok: false, error: '이 행사의 컬럼이 아닙니다.' };
  if (!(await assertMemberOfProgram(programId, userId))) return { ok: false, error: '이 행사 소속 회원이 아닙니다.' };
  const admin = createAdminClient();
  const { error } = value
    ? await admin.from('roster_values').upsert({ column_id: columnId, user_id: userId, value, updated_by: actor.id, updated_at: new Date().toISOString() }, { onConflict: 'column_id,user_id' })
    : await admin.from('roster_values').delete().eq('column_id', columnId).eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/nextlab/members');
  return { ok: true, message: '마크를 저장했습니다.' };
}

/* ── 로그인 안내 문자 ───────────────────────────────────────────────────── */

/**
 * 선택 회원에게 로그인 안내 문자 발송 (행사별 문자 API → 플랫폼 폴백).
 * 명단 우선 등록 → 안내 문자 수신 → 첫 로그인(비밀번호 변경) 흐름의 두 번째 단계.
 * `{name}` 플레이스홀더는 회원 이름으로 치환된다. 발송 이력은 감사로그로 남아 명단에 표시된다.
 */
export async function sendLoginGuideAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const actor = await requireNextlab();
  {
    const ctx = await contextOrNull(actor);
    if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
    const denied = denyUnless(ctx, 'sms');
    if (denied) return { ok: false, error: denied };
  }
  const programId = await currentProgramId(actor);
  if (!programId) return { ok: false, error: '행사를 먼저 선택하세요.' };
  let userIds: string[] = [];
  try {
    userIds = JSON.parse(String(formData.get('userIds') ?? '[]'));
  } catch {
    return { ok: false, error: '대상 목록을 읽을 수 없습니다.' };
  }
  if (!Array.isArray(userIds) || userIds.length === 0) return { ok: false, error: '발송할 회원을 선택하세요.' };
  const customHead = String(formData.get('message') ?? '').trim();

  const admin = createAdminClient();
  const [{ data: program }, { data: memberships }] = await Promise.all([
    admin.from('programs').select('name, sms_footer').eq('id', programId).maybeSingle(),
    admin.from('program_members').select('user_id').eq('program_id', programId).in('user_id', userIds),
  ]);
  if (!program) return { ok: false, error: '행사를 찾을 수 없습니다.' };
  const memberIds = new Set((memberships ?? []).map((m) => m.user_id));
  const targets = userIds.filter((id) => memberIds.has(id));
  if (targets.length === 0) return { ok: false, error: '이 행사 소속 회원이 아닙니다.' };
  const { data: users } = await admin.from('users').select('id, name, email, phone, must_change_password, is_active').in('id', targets);

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) return { ok: false, error: '앱 주소(NEXT_PUBLIC_APP_URL)가 설정되지 않아 링크를 만들 수 없습니다.' };
  const creds = await resolveSmsCredentials(programId, 'send');

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const u of users ?? []) {
    const digits = (u.phone ?? '').replace(/\D/g, '');
    if (!u.is_active || digits.length < 10) {
      skipped += 1;
      continue;
    }
    const head = customHead
      ? customHead.replaceAll('{name}', u.name)
      : `[${program.name}] ${u.name}님, '${program.name}' 멘토링 플랫폼에 회원으로 등록되었습니다.`;
    const lines = [head, `${base}/login`, `아이디: 이메일(${u.email ?? '-'}) 또는 휴대폰 번호`];
    if (u.must_change_password) lines.push('임시 비밀번호: 본인 휴대폰 번호(숫자만). 첫 로그인 시 비밀번호를 변경해 주세요.');
    if (program.sms_footer) lines.push(program.sms_footer);
    try {
      const r = await sendSolapiSms(digits, lines.join('\n'), creds ? { creds } : {});
      if (r.ok) {
        sent += 1;
        // 발송 이력 = 명단의 '안내 발송됨' 표시 근거. insert 실패를 삼키지 않는다(§6-3).
        const { error: auditError } = await admin.from('audit_logs').insert({
          actor_id: actor.id,
          program_id: programId,
          action: LOGIN_GUIDE_SMS_ACTION,
          entity_type: 'users',
          entity_id: u.id,
          metadata: { phone_last4: digits.slice(-4) },
        });
        if (auditError) console.error('login guide audit insert failed:', auditError.message);
      } else failed += 1;
    } catch {
      failed += 1;
    }
  }
  revalidatePath('/nextlab/members');
  if (sent === 0) return { ok: false, error: `발송된 문자가 없습니다. (실패 ${failed} · 제외 ${skipped} — 비활성 계정·휴대폰 없음)` };
  return { ok: true, message: `안내 문자 ${sent}건을 발송했습니다.${failed ? ` 실패 ${failed}건.` : ''}${skipped ? ` 제외 ${skipped}건(비활성·휴대폰 없음).` : ''}` };
}
