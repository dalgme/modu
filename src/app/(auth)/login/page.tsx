'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';

import { signIn, type ActionState } from '@/lib/auth/actions';
import { LoginHeroBg } from '@/components/auth/login-hero-bg';
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
      {/* 브랜드 히어로 (도시 황혼 야경 보정 배경 + 코랄 글로우) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-midnight p-12 text-midnight-foreground lg:flex">
        <LoginHeroBg />

        <div className="relative z-10">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide">
            대전일자리경제진흥원 × 넥스트랩
          </span>
        </div>

        <div className="relative z-10 max-w-md space-y-5">
          <h1 className="text-4xl font-bold leading-[1.2]">
            소상공인·자영업자
            <br />
            <span className="text-primary">재기지원</span> 운영관리
          </h1>
          <p className="text-sm leading-relaxed text-midnight-foreground/70">
            컨설팅 · 경영개선 · 폐업정리의 11단계 지원 과정을 하나의 플랫폼에서. 멘토링부터
            붙임서식 자동 생성, 지급까지 투명하게 관리합니다.
          </p>
          <ul className="space-y-2 pt-2 text-sm text-midnight-foreground/80">
            {['업체별 진행단계 실시간 시각화', '멘토링·서식·서명 자동화', '역할별 처리 대기 알림'].map(
              (t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {t}
                </li>
              ),
            )}
          </ul>
        </div>

        <div className="relative z-10 text-xs text-midnight-foreground/45">
          © 2026 넥스트랩 · 내부 업무용 시스템
        </div>
      </div>

      {/* 로그인 폼 */}
      <div className="flex flex-col bg-background p-6">
        <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-sm border-none shadow-none sm:border sm:shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">로그인</CardTitle>
            <CardDescription>재기지원사업 운영관리 시스템</CardDescription>
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
              <p className="mb-1.5 font-semibold text-foreground">멘티기업 로그인 안내</p>
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
                계정은 운영팀(넥스트랩)이 발급합니다. 로그인이 안 되면 담당 멘토나 운영팀에 문의해
                주세요.
              </p>
            </div>
          </CardContent>
        </Card>
        </div>

        {/* 주관·운영 기관 로고 락업 */}
        <footer className="mt-6 flex flex-col items-center gap-3 border-t pt-6">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            주관 · 운영
          </span>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logo-daejeon.png"
              alt="대전일자리경제진흥원"
              className="h-7 w-auto"
            />
            <span className="h-7 w-px bg-border" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-nextlab.jpg" alt="주식회사 넥스트랩" className="h-6 w-auto" />
          </div>
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
