'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';

import { signIn, type ActionState } from '@/lib/auth/actions';
import { LoginHeroBg } from '@/components/auth/login-hero-bg';
import { LoginHeroWords } from '@/components/auth/login-hero-words';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? '로그인 중…' : '로그인'}
    </Button>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { changed?: string; reset?: string };
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(signIn, undefined);
  const notice = searchParams?.reset
    ? '비밀번호가 재설정되었습니다. 새 비밀번호로 로그인하세요.'
    : searchParams?.changed
      ? '비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.'
      : null;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* 브랜드 히어로 — 실사 배경 + 브랜딩 개념어 오버레이 */}
      <div className="relative hidden flex-col overflow-hidden bg-midnight p-12 text-midnight-foreground lg:flex">
        <LoginHeroBg />
        <LoginHeroWords />
      </div>

      {/* 로그인 폼 */}
      <div className="flex flex-col bg-background p-6">
        <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-sm border-none shadow-none sm:border sm:shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">로그인</CardTitle>
            <CardDescription>멘토링 운영관리 플랫폼</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="flex flex-col gap-4">
            {notice && (
              <p
                className="rounded-md border border-status-approved/30 bg-status-approved/5 px-3 py-2 text-sm text-status-approved"
                role="status"
              >
                {notice}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="identifier">아이디 · 휴대폰 번호 · 이메일</Label>
              <Input
                id="identifier"
                name="identifier"
                type="text"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {state?.error && (
              <p className="text-sm font-medium text-destructive" role="alert">
                {state.error}
              </p>
            )}
            <SubmitButton />
          </form>
          <p className="mt-4 text-center text-sm">
            <Link
              href="/reset-password"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              비밀번호를 잊으셨나요?
            </Link>
          </p>
            <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed">
              <p className="mb-1.5 font-semibold text-foreground">멘티 로그인 안내</p>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                <li>
                  <b className="text-foreground">아이디</b> — 이름 + 휴대폰 뒷자리 4개 (예:{' '}
                  <span className="rounded bg-background px-1 font-mono text-foreground">
                    강종복0306
                  </span>
                  ). 휴대폰 번호나 이메일로도 로그인됩니다.
                </li>
                <li>
                  <b className="text-foreground">처음 비밀번호</b> — 등록하신{' '}
                  <b className="text-foreground">휴대폰 번호(&lsquo;-&rsquo; 없이 숫자만)</b>. 처음
                  로그인하면 새 비밀번호로 바꾸는 화면이 나옵니다.
                </li>
                <li>
                  비밀번호를 잊으면 아래 <b className="text-foreground">[비밀번호를 잊으셨나요?]</b>에서
                  휴대폰 문자로 인증받아 재설정하세요.
                </li>
              </ul>
              <p className="mt-1.5 text-muted-foreground">
                계정은 행사 운영사가 발급합니다. 로그인이 안 되면 담당 멘토나 운영사에 문의해 주세요.
              </p>
            </div>
          </CardContent>
        </Card>
        </div>

        <footer className="mt-6 flex flex-col items-center gap-3 border-t pt-6">
          <span className="text-[11px] text-muted-foreground">
            로그인 후 소속 행사를 선택하면 해당 행사의 발주처·운영사 브랜딩이 적용됩니다.
          </span>
          <nav className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <Link href="/privacy-policy" className="underline-offset-4 hover:underline">
              개인정보처리방침
            </Link>
            <span className="h-3 w-px bg-border" />
            <Link href="/terms" className="underline-offset-4 hover:underline">
              시스템 이용수칙
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
