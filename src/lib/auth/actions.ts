'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loginSchema, changePasswordSchema } from '@/lib/validations/auth';
import { resolveUserByIdentifier } from '@/lib/auth/identifier';
import { getImpersonation, VIEW_AS_COOKIE } from '@/lib/auth/impersonation';
import { logAudit } from '@/lib/workflow/audit';

export type ActionState = { error?: string } | undefined;

/**
 * 로그인(이메일 또는 휴대폰 번호 + 비밀번호). 성공 시 상태·역할에 따라 리다이렉트.
 * 휴대폰 번호로 입력하면 해당 계정의 이메일로 변환해 인증한다. 셀프가입 없음(관리자 발급).
 */
export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get('identifier'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }

  const generic = { error: '이메일·휴대폰 번호 또는 비밀번호가 올바르지 않습니다.' };
  let email = parsed.data.identifier;
  if (!email.includes('@')) {
    // 휴대폰 번호로 로그인 → 계정 이메일로 변환
    const resolved = await resolveUserByIdentifier(parsed.data.identifier);
    if (!resolved || resolved === 'ambiguous' || !resolved.email) return generic;
    email = resolved.email;
  }

  const supabase = createClient();
  let auth = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  // 최초 임시 비밀번호 = 휴대폰 번호(숫자)인데 하이픈을 넣어 입력한 경우,
  // 숫자만으로 한 번 더 시도해 실수로 인한 첫 로그인 실패를 방지한다.
  if (auth.error || !auth.data.user) {
    const digits = parsed.data.password.replace(/\D/g, '');
    if ((digits.length === 10 || digits.length === 11) && digits !== parsed.data.password) {
      auth = await supabase.auth.signInWithPassword({ email, password: digits });
    }
  }
  const { data, error } = auth;
  if (error || !data.user) {
    return generic;
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: '비활성화된 계정입니다. 관리자에게 문의하세요.' };
  }

  if (profile.must_change_password) {
    redirect('/change-password');
  }
  if (profile.role === 'mentee' && !profile.privacy_agreed_at) {
    redirect('/mentee/consent');
  }
  redirect('/hub');
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  // 대행(view-as) 중이었다면 종료를 감사기록에 남기고 쿠키를 반드시 지운다.
  // 남겨두면 다음 로그인 시 대행이 무기록으로 되살아난다.
  const imp = await getImpersonation();
  if (imp) {
    await logAudit(createAdminClient(), {
      actorId: imp.actorId,
      action: 'impersonation.stop',
      entityType: 'users',
      entityId: imp.target.id,
      metadata: { reason: 'sign_out', target_name: imp.target.name },
    });
  }
  cookies().delete(VIEW_AS_COOKIE);
  await supabase.auth.signOut();
  redirect('/login');
}

/**
 * 로그인 화면에서의 자가 비밀번호 변경.
 * 이메일 + 현재(임시) 비밀번호로 본인 확인 후 새 비밀번호로 변경한다.
 * (로그인 상태가 아니어도 사용 가능 — 인증을 이 액션 안에서 수행)
 */
export async function selfChangePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get('email') ?? '');
  const current = String(formData.get('current') ?? '');
  const parsed = changePasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: current });
  if (error || !data.user) {
    return { error: '이메일 또는 현재 비밀번호가 올바르지 않습니다.' };
  }

  const { error: pwError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (pwError) {
    await supabase.auth.signOut();
    return { error: '비밀번호 변경에 실패했습니다. 다시 시도하세요.' };
  }

  const admin = createAdminClient();
  await admin
    .from('users')
    .update({ must_change_password: false, password_changed_at: new Date().toISOString() })
    .eq('id', data.user.id);

  await supabase.auth.signOut();
  redirect('/login?changed=1');
}

/**
 * 최초 로그인 시 임시 비밀번호 변경. 완료 후 must_change_password 해제.
 * 프로필 플래그 갱신은 service_role(admin) 로 처리 (users 테이블 self-update 미허용).
 */
export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = changePasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { error: pwError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (pwError) {
    return { error: '비밀번호 변경에 실패했습니다. 다시 시도하세요.' };
  }

  const admin = createAdminClient();
  const { error: flagError } = await admin
    .from('users')
    .update({ must_change_password: false, password_changed_at: new Date().toISOString() })
    .eq('id', user.id);
  if (flagError) {
    return { error: '프로필 갱신에 실패했습니다. 관리자에게 문의하세요.' };
  }

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role === 'mentee') {
    redirect('/mentee/consent');
  }
  redirect(profile ? '/hub' : '/login');
}

/**
 * 멘티 개인정보 수집·이용 동의. 동의 시 privacy_agreed_at·activated_at 기록.
 */
export async function agreePrivacy(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin.from('users').update({ privacy_agreed_at: now, activated_at: now }).eq('id', user.id);

  redirect('/hub');
}
