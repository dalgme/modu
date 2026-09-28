'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loginSchema, changePasswordSchema } from '@/lib/validations/auth';
import { resolveUserByIdentifier } from '@/lib/auth/identifier';
import { getImpersonation, VIEW_AS_COOKIE } from '@/lib/auth/impersonation';
import { logAudit } from '@/lib/workflow/audit';
import { smsConfigured } from '@/lib/notifications/provider';
import {
  hashIdentifier,
  hashIp,
  isLockedOut,
  isMfaBypassEmail,
  isTrustedDevice,
  issueLoginOtp,
  lockoutMessage,
  recordLoginAttempt,
  requestClientInfo,
  requiresMfa,
} from '@/lib/auth/login-security';
import { clearMfa, readTrustedToken, setMfaVerified } from '@/lib/auth/mfa-cookie';

export type ActionState = { error?: string } | undefined;

/**
 * 로그인(이메일 또는 휴대폰 번호 + 비밀번호). 성공 시 상태·역할에 따라 리다이렉트.
 * 휴대폰 번호로 입력하면 해당 계정의 이메일로 변환해 인증한다. 셀프가입 없음(관리자 발급).
 *
 * P35-A 로그인 보안
 *  ① 처리 전 잠금 검사(계정 10분 내 5회 → 15분, IP 10분 내 30회 → 15분) — 잠금이면 남은 분 안내
 *  ② 실패는 login_attempts 에 기록(원문 식별자·IP 는 해시), 잠금이 새로 걸리면 감사 auth.lockout
 *  ③ 성공 기록 → 2단계 인증 대상(발주처·운영사·플랫폼 관리자)이면 신뢰 기기·예외를 확인한 뒤 OTP 발급 → /login/verify
 *  ④ 임시 비밀번호·멘티 동의·허브 분기는 OTP 통과 뒤(mfa-actions.ts)에도 같은 순서로 적용된다
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
  const identifierHash = hashIdentifier(parsed.data.identifier);
  const { ip, userAgent } = requestClientInfo();
  const ipHash = hashIp(ip);
  const attempt = (input: { userId?: string | null; success: boolean; reason?: string }) =>
    recordLoginAttempt({ identifierHash, ipHash, userAgent, ...input });

  // ① 잠금 검사 — 비밀번호를 확인하기 전에 막는다 (잠금 중 시도는 기록만 하고 잠금 산정에서는 제외)
  const lock = await isLockedOut(identifierHash, ipHash);
  if (lock.locked) {
    await attempt({ success: false, reason: lock.reason === 'ip' ? 'ip_blocked' : 'locked' });
    return { error: lockoutMessage(lock) };
  }

  // 잠금 감사(auth.lockout)는 "이번 실패로 잠금이 새로 걸렸을 때" 한 번만 남긴다
  const failAndMaybeLock = async (reason: string, userId: string | null): Promise<ActionState> => {
    await attempt({ success: false, reason, userId });
    const after = await isLockedOut(identifierHash, ipHash);
    if (after.locked) {
      await logAudit(createAdminClient(), {
        actorId: userId,
        action: 'auth.lockout',
        entityType: 'users',
        entityId: userId ?? undefined,
        metadata: { scope: after.reason, minutes: after.retryAfterMin, identifier_hash: identifierHash.slice(0, 12) },
      });
    }
    return generic;
  };

  // 식별자 → 계정 (이메일·휴대폰·멘티 아이디). 실패 기록에 user_id 를 남기기 위해 이메일도 조회한다
  const resolved = await resolveUserByIdentifier(parsed.data.identifier);
  const resolvedUser = resolved && resolved !== 'ambiguous' ? resolved : null;
  let email = parsed.data.identifier;
  if (!email.includes('@')) {
    // 휴대폰 번호·멘티 아이디로 로그인 → 계정 이메일로 변환
    if (!resolvedUser || !resolvedUser.email) return failAndMaybeLock('unknown_identifier', null);
    email = resolvedUser.email;
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
    // ② 비밀번호 실패 — 계정 존재 여부는 문구로 드러내지 않는다(generic)
    return failAndMaybeLock(resolvedUser ? 'bad_password' : 'unknown_identifier', resolvedUser?.id ?? null);
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    await attempt({ success: false, reason: 'inactive', userId: data.user.id });
    return { error: '비활성화된 계정입니다. 관리자에게 문의하세요.' };
  }

  // ③ 성공 기록 (이전 실패 카운터는 이 행에서 리셋된다)
  await attempt({ success: true, userId: profile.id });
  clearMfa(); // 다른 계정의 잔여 표시가 남지 않도록

  if (await requiresMfa(profile.id)) {
    const admin = createAdminClient();
    const auditMfa = (action: string, metadata: Record<string, string | number | boolean | null> = {}) =>
      logAudit(admin, { actorId: profile.id, action, entityType: 'users', entityId: profile.id, metadata });

    const trustedToken = readTrustedToken();
    if (isMfaBypassEmail(profile.email)) {
      // 배포 스모크 점검 계정 등 — 환경변수 MFA_BYPASS_EMAILS. 통과하되 감사에 남긴다
      await auditMfa('auth.mfa_bypassed', { email: profile.email });
      setMfaVerified(profile.id);
    } else if (trustedToken && (await isTrustedDevice(profile.id, trustedToken))) {
      // 신뢰 기기(30일) — OTP 생략
      setMfaVerified(profile.id);
    } else if (!smsConfigured()) {
      // 예외: 문자 발송 설정이 없는 배포(로컬·초기 세팅·발송사 장애 대응)에서 OTP 를 요구하면
      // 담당자 전원이 로그인하지 못해 플랫폼 자체가 잠긴다. 그래서 OTP 를 건너뛰고 감사에만 남긴다.
      // 발송 설정을 되살리면 다음 로그인부터 자동으로 OTP 가 요구된다.
      await auditMfa('auth.mfa_skipped_no_sms');
      setMfaVerified(profile.id);
    } else {
      const issued = await issueLoginOtp(profile.id, profile.phone, ipHash);
      if (!issued.ok && issued.error === 'no_phone') {
        // 휴대폰이 등록되지 않은 담당자(예: 초기 플랫폼 관리자)를 여기서 막으면 스스로 번호를
        // 등록할 길이 없어 영구 잠금이 된다. 통과시키되 감사에 남기고, 화면에서 등록을 독려한다.
        await auditMfa('auth.mfa_skipped_no_phone', { email: profile.email });
        setMfaVerified(profile.id);
      } else {
        if (!issued.ok && (issued.error === 'send_failed' || issued.error === 'store_failed')) {
          await supabase.auth.signOut();
          await attempt({ success: false, reason: 'sms_failed', userId: profile.id });
          return { error: '인증번호 문자 발송에 실패했습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.' };
        }
        // 발급 성공 또는 cooldown / too_many(이미 유효한 코드가 있음) — 입력 화면으로 (재전송은 화면에서)
        redirect('/login/verify');
      }
    }
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
  // 2단계 인증 통과 표시는 지운다. 신뢰 기기 쿠키(modu_trusted)는 유지 — 다음 로그인 때 OTP 를 생략하는 용도.
  clearMfa();
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
 * useFormState 시그니처 (P31) — 대행 중에는 조용히 튕기지 않고 오류 문구를 돌려준다.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useFormState 시그니처 (이전 상태·폼 데이터는 쓰지 않는다)
export async function agreePrivacy(_prev: ActionState, _formData?: FormData): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // 동의는 멘티 본인만 — 대행 중 제출하면 auth.uid()=실행자라 실행자 행이 오염된다 (P19). 화면에 사유를 보여준다 (P31)
  if (await getImpersonation()) {
    return { error: '개인정보 동의는 멘티 본인만 할 수 있습니다.' };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin.from('users').update({ privacy_agreed_at: now, activated_at: now }).eq('id', user.id);

  redirect('/hub');
}
