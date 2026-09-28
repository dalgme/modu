'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/workflow/audit';
import {
  hashIp,
  issueLoginOtp,
  issueTrustedDevice,
  requestClientInfo,
  requiresMfa,
  verifyLoginOtp,
  OTP_MAX_ATTEMPTS,
} from '@/lib/auth/login-security';
import { clearMfa, setMfaVerified, setTrustedToken } from '@/lib/auth/mfa-cookie';

export type MfaState = { error?: string; notice?: string } | undefined;

/** 로그인 세션(실제 사용자)이 2단계 인증 대상이면 프로필을 돌려준다. 아니면 null (호출부가 /login 으로) */
async function mfaSubject() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await createAdminClient().from('users').select('*').eq('id', user.id).maybeSingle();
  if (!profile || !profile.is_active) return null;
  if (!(await requiresMfa(profile.id))) return null;
  return profile;
}

/** OTP 통과 뒤 목적지 — signIn 의 분기와 같은 순서 (임시 비밀번호 → 멘티 동의 → 허브) */
function afterLoginPath(profile: { must_change_password: boolean; role: string; privacy_agreed_at: string | null }): string {
  if (profile.must_change_password) return '/change-password';
  if (profile.role === 'mentee' && !profile.privacy_agreed_at) return '/mentee/consent';
  return '/hub';
}

/**
 * 인증번호 확인. 성공 = modu_mfa 세팅(+ "이 기기 30일 기억" 이면 신뢰 기기 발급) + 감사 auth.mfa_verified.
 * 5회 실패 = 해당 OTP 무효 + 로그아웃 + 감사 auth.mfa_failed(exhausted) → /login?mfa=failed
 */
export async function verifyLoginOtpAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const profile = await mfaSubject();
  if (!profile) redirect('/login');

  const code = String(formData.get('code') ?? '').replace(/\D/g, '');
  const remember = formData.get('remember') === 'on' || formData.get('remember') === '1';
  if (code.length !== 6) return { error: '인증번호 6자리를 입력하세요.' };

  const admin = createAdminClient();
  const { ip, userAgent } = requestClientInfo();
  const ipHash = hashIp(ip);
  const result = await verifyLoginOtp(profile.id, code);

  if (!result.ok) {
    if (result.reason === 'exhausted') {
      await logAudit(admin, {
        actorId: profile.id,
        action: 'auth.mfa_failed',
        entityType: 'users',
        entityId: profile.id,
        metadata: { reason: 'exhausted', max_attempts: OTP_MAX_ATTEMPTS },
      });
      clearMfa();
      await createClient().auth.signOut();
      redirect('/login?mfa=failed');
    }
    if (result.reason === 'expired') {
      return { error: '인증번호가 만료되었거나 없습니다. [재전송]으로 새 인증번호를 받으세요.' };
    }
    return { error: `인증번호가 올바르지 않습니다. (남은 시도 ${result.attemptsLeft}회)` };
  }

  setMfaVerified(profile.id);
  let trusted = false;
  if (remember) {
    const token = await issueTrustedDevice(profile.id, userAgent, ipHash);
    if (token) {
      setTrustedToken(token);
      trusted = true;
      await logAudit(admin, {
        actorId: profile.id,
        action: 'auth.trusted_device',
        entityType: 'users',
        entityId: profile.id,
        metadata: { days: 30 },
      });
    }
  }
  await logAudit(admin, {
    actorId: profile.id,
    action: 'auth.mfa_verified',
    entityType: 'users',
    entityId: profile.id,
    metadata: { remember: trusted },
  });

  redirect(afterLoginPath(profile));
}

/** 인증번호 재전송 — 60초 쿨다운(최근 발급 created_at 기준), 감사 auth.mfa_resent */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useFormState 시그니처 (폼 데이터는 쓰지 않는다)
export async function resendLoginOtpAction(_prev: MfaState, _formData?: FormData): Promise<MfaState> {
  const profile = await mfaSubject();
  if (!profile) redirect('/login');

  const { ip } = requestClientInfo();
  const issued = await issueLoginOtp(profile.id, profile.phone, hashIp(ip), { audit: 'auth.mfa_resent' });
  if (issued.ok) return { notice: '인증번호를 다시 보냈습니다. 문자를 확인하세요.' };
  switch (issued.error) {
    case 'cooldown':
      return { error: `잠시 후 다시 시도하세요. (${issued.retryAfterSec ?? 60}초 후 재전송 가능)` };
    case 'too_many':
      return { error: '인증번호 요청이 너무 많습니다. 1시간 뒤 다시 시도하거나 관리자에게 문의하세요.' };
    case 'no_phone':
      return { error: '2단계 인증용 휴대폰 번호가 없습니다. 관리자에게 문의하세요.' };
    case 'sms_not_configured':
      return { error: '문자 발송이 설정되지 않은 환경입니다. 다시 로그인하면 인증 없이 진행됩니다.' };
    default:
      return { error: '인증번호 발송에 실패했습니다. 잠시 후 다시 시도하세요.' };
  }
}
