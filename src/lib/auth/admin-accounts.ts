import 'server-only';
import { randomBytes } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { toStoredPhone } from '@/lib/auth/identifier';
import type { UserRole } from '@/lib/auth/roles';

/** 영문 대/소문자·숫자를 각각 1개 이상 포함하는 임시 비밀번호 생성 (14자) */
export function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const all = upper + lower + digit;
  const bytes = randomBytes(14);
  const pick = (set: string, b: number) => set[b % set.length]!;

  const chars: string[] = [pick(upper, bytes[0]!), pick(lower, bytes[1]!), pick(digit, bytes[2]!)];
  for (let i = 3; i < 14; i++) {
    chars.push(pick(all, bytes[i]!));
  }
  // 앞쪽 3개 고정 위치를 섞는다 (bytes 기반 결정적 셔플)
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

/**
 * 임시 비밀번호 = 휴대폰 번호(숫자만). 최초 로그인 시 강제 변경된다.
 * 휴대폰 번호가 없거나 6자리 미만이면 랜덤 임시 비밀번호로 대체한다.
 */
export function phoneTempPassword(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 6 ? digits : generateTempPassword();
}

interface CreateStaffOrMentorInput {
  email: string;
  name: string;
  phone?: string;
  role: Extract<UserRole, 'institution' | 'nextlab' | 'mentor'>;
  /** 직위 (발주처·운영사 담당자) */
  position?: string;
  /** 소속 (멘토의 회사·기관, 담당자의 부서 등) */
  organization?: string;
  /** 발급을 수행하는 관리자 (감사로그용) */
  actorId: string;
}

export interface AccountIssueResult {
  userId: string;
  email: string;
  tempPassword: string;
}

/**
 * 발주처/운영사/멘토 계정 발급.
 * 임시 비밀번호 생성 → auth 사용자 + users 프로필(must_change_password=true) 생성 → 감사로그.
 * service_role(admin) 필요.
 */
export async function createStaffOrMentorAccount(
  input: CreateStaffOrMentorInput,
): Promise<AccountIssueResult> {
  const admin = createAdminClient();
  const tempPassword = phoneTempPassword(input.phone);

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: input.name },
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? '계정 생성에 실패했습니다.');
  }

  const { error: profileError } = await admin.from('users').insert({
    id: data.user.id,
    role: input.role,
    name: input.name,
    phone: toStoredPhone(input.phone),
    email: input.email,
    position: input.position?.trim() || null,
    organization: input.organization?.trim() || null,
    must_change_password: true,
  });
  if (profileError) {
    // 프로필 생성 실패 시 auth 사용자 롤백
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(profileError.message);
  }

  await admin.from('audit_logs').insert({
    actor_id: input.actorId,
    action: 'account.create',
    entity_type: 'users',
    entity_id: data.user.id,
    metadata: { role: input.role, email: input.email },
  });

  return { userId: data.user.id, email: input.email, tempPassword };
}

interface InviteMenteeInput {
  caseId: string;
  email: string;
  name: string;
  phone?: string;
  actorId: string;
}

/**
 * 멘티 초대: 케이스 등록 후 운영사가 발급.
 * 임시 비밀번호 계정 생성(must_change_password=true, invited_at) → 케이스에 mentee_id 연결 → 감사로그.
 * 최초 로그인 시 비밀번호 변경 + 개인정보 동의 후 활성화된다.
 */
export async function inviteMentee(input: InviteMenteeInput): Promise<AccountIssueResult> {
  const admin = createAdminClient();
  const tempPassword = phoneTempPassword(input.phone);
  const now = new Date().toISOString();

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: input.name },
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? '멘티 계정 생성에 실패했습니다.');
  }

  const { error: profileError } = await admin.from('users').insert({
    id: data.user.id,
    role: 'mentee',
    name: input.name,
    phone: toStoredPhone(input.phone),
    email: input.email,
    must_change_password: true,
    invited_at: now,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(profileError.message);
  }

  const { error: linkError } = await admin
    .from('cases')
    .update({ mentee_id: data.user.id })
    .eq('id', input.caseId);
  if (linkError) {
    throw new Error(linkError.message);
  }

  await admin.from('audit_logs').insert({
    actor_id: input.actorId,
    action: 'mentee.invite',
    entity_type: 'cases',
    entity_id: input.caseId,
    metadata: { mentee_id: data.user.id, email: input.email },
  });

  return { userId: data.user.id, email: input.email, tempPassword };
}
