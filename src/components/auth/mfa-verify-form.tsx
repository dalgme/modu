'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { resendLoginOtpAction, verifyLoginOtpAction, type MfaState } from '@/lib/auth/mfa-actions';
import { signOut } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? '확인 중…' : '확인'}
    </Button>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      {pending ? '보내는 중…' : '인증번호 재전송'}
    </Button>
  );
}

function SwitchAccountButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50">
      다른 계정으로 로그인
    </button>
  );
}

/**
 * 담당자 2단계 인증 입력 폼 (P35-A). 서버 컴포넌트(page.tsx)가 마스킹된 수신 번호만 넘긴다.
 * 로그인 페이지의 Card 구성을 그대로 따른다.
 */
export function MfaVerifyForm({ maskedPhone, hasPhone }: { maskedPhone: string; hasPhone: boolean }) {
  const [state, verifyAction] = useFormState<MfaState, FormData>(verifyLoginOtpAction, undefined);
  const [resendState, resendAction] = useFormState<MfaState, FormData>(resendLoginOtpAction, undefined);

  return (
    <Card className="w-full max-w-sm border-none shadow-none sm:border sm:shadow-sm">
      <CardHeader className="space-y-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/wordmark-light.png" alt="멘토링 운영관리" className="mb-3 h-11 w-auto object-contain object-left" />
        <CardTitle className="text-xl">2단계 인증</CardTitle>
        <CardDescription>
          {hasPhone ? (
            <>
              <b className="text-foreground">{maskedPhone}</b> 로 보낸 인증번호 6자리를 입력하세요. (5분 내 유효)
            </>
          ) : (
            '2단계 인증용 휴대폰 번호가 등록되어 있지 않습니다.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {hasPhone ? (
          <>
            <form action={verifyAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="code">인증번호</Label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="6자리 숫자"
                  className="text-center text-lg tracking-[0.4em]"
                  autoFocus
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="remember" value="1" className="h-4 w-4 rounded border" />
                이 기기에서는 30일 동안 인증번호를 묻지 않기
              </label>
              {state?.error && (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {state.error}
                </p>
              )}
              <ConfirmButton />
            </form>
            <form action={resendAction} className="flex flex-col gap-2">
              {resendState?.notice && (
                <p className="rounded-md border border-status-approved/30 bg-status-approved/5 px-3 py-2 text-sm text-status-approved" role="status">
                  {resendState.notice}
                </p>
              )}
              {resendState?.error && (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {resendState.error}
                </p>
              )}
              <ResendButton />
              <p className="text-xs text-muted-foreground">문자가 오지 않으면 1분 뒤 재전송할 수 있습니다. 공용 기기에서는 &lsquo;기억하기&rsquo;를 선택하지 마세요.</p>
            </form>
          </>
        ) : (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
            운영사 회원관리(또는 플랫폼 콘솔)에서 휴대폰 번호를 등록한 뒤 다시 로그인하세요. 관리자에게 문의해 주세요.
          </p>
        )}
        <form action={signOut} className="text-center">
          <SwitchAccountButton />
        </form>
      </CardContent>
    </Card>
  );
}
