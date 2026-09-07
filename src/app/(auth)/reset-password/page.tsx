'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';

import {
  requestPasswordResetAction,
  verifyPasswordResetAction,
  type ResetState,
} from '@/lib/auth/password-reset-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

export default function ResetPasswordPage() {
  const [requestState, requestAction] = useFormState<ResetState, FormData>(
    requestPasswordResetAction,
    undefined,
  );
  const [verifyState, verifyAction] = useFormState<ResetState, FormData>(
    verifyPasswordResetAction,
    undefined,
  );
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [identifier, setIdentifier] = useState('');

  // 1단계 요청 성공 시 2단계(인증번호 입력)로 전환
  useEffect(() => {
    if (requestState?.ok) setStep('verify');
  }, [requestState]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg">비밀번호 재설정</CardTitle>
          <CardDescription>
            {step === 'request'
              ? '가입한 이메일 또는 휴대폰 번호를 입력하면 등록된 휴대폰으로 인증번호를 보내드립니다.'
              : '문자로 받은 6자리 인증번호와 새 비밀번호를 입력하세요.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'request' ? (
            <form action={requestAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="identifier">이메일 또는 휴대폰 번호</Label>
                <Input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
              {requestState && !requestState.ok && 'error' in requestState && (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {requestState.error}
                </p>
              )}
              <SubmitButton idle="인증번호 받기" busy="발송 중…" />
            </form>
          ) : (
            <form action={verifyAction} className="flex flex-col gap-4">
              <input type="hidden" name="identifier" value={identifier} />
              <div className="rounded-md border border-status-approved/30 bg-status-approved/5 px-3 py-2 text-xs text-status-approved">
                등록된 휴대폰으로 인증번호를 보냈습니다. 문자가 오지 않으면 번호를 확인하거나 운영팀에
                문의하세요.
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="code">인증번호 (6자리)</Label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">새 비밀번호</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
                <p className="text-xs text-muted-foreground">8자 이상</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">새 비밀번호 확인</Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              {verifyState && !verifyState.ok && 'error' in verifyState && (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {verifyState.error}
                </p>
              )}
              <SubmitButton idle="비밀번호 재설정" busy="변경 중…" />
              <button
                type="button"
                onClick={() => setStep('request')}
                className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                인증번호를 다시 받기
              </button>
            </form>
          )}
          <p className="mt-4 text-center text-xs">
            <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">
              로그인으로 돌아가기
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
