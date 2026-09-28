import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMfaBypassEmail, maskPhone, requiresMfa } from '@/lib/auth/login-security';
import { readMfaVerified } from '@/lib/auth/mfa-cookie';
import { smsConfigured } from '@/lib/notifications/provider';
import { normalizePhone } from '@/lib/utils/phone';
import { LoginHeroBg } from '@/components/auth/login-hero-bg';
import { LoginHeroWords } from '@/components/auth/login-hero-words';
import { MfaVerifyForm } from '@/components/auth/mfa-verify-form';

export const dynamic = 'force-dynamic';

/**
 * 담당자 2단계 인증 화면 (P35-A). signIn 이 OTP 를 발급한 뒤 여기로 보낸다.
 * 로그인 세션이 없거나 OTP 대상이 아니면 /login, 이미 통과했거나 예외(문자 미설정·예외 이메일)면 /hub.
 * 가드(requireRealRole·requirePlatformAdmin)는 통과 전 스태프 콘솔 진입을 이 화면으로 되돌린다.
 */
export default async function LoginVerifyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await createAdminClient().from('users').select('id, email, phone, is_active, must_change_password, role, privacy_agreed_at').eq('id', user.id).maybeSingle();
  if (!profile || !profile.is_active) redirect('/login');
  if (!(await requiresMfa(profile.id))) redirect('/login');

  const already = readMfaVerified(profile.id) || isMfaBypassEmail(profile.email) || !smsConfigured();
  if (already) {
    if (profile.must_change_password) redirect('/change-password');
    if (profile.role === 'mentee' && !profile.privacy_agreed_at) redirect('/mentee/consent');
    redirect('/hub');
  }

  const hasPhone = Boolean(normalizePhone(profile.phone));

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col overflow-hidden bg-midnight p-12 text-midnight-foreground lg:flex">
        <LoginHeroBg />
        <LoginHeroWords />
      </div>
      <div className="flex flex-col bg-background p-6">
        <div className="flex flex-1 items-center justify-center">
          <MfaVerifyForm maskedPhone={maskPhone(profile.phone)} hasPhone={hasPhone} />
        </div>
        <footer className="mt-6 flex flex-col items-center gap-3 border-t pt-6">
          <span className="text-[11px] text-muted-foreground">
            발주처·운영사·플랫폼 관리자 계정은 휴대폰 문자 인증을 거쳐야 콘솔에 들어갈 수 있습니다.
          </span>
        </footer>
      </div>
    </main>
  );
}
