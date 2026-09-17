'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

import { registerOperatorAction, type OperatorRegisterState } from '@/lib/auth/register-operator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? '등록 중…' : '총괄담당자 등록'}
    </Button>
  );
}

/** 운영사 총괄담당자 셀프 등록 폼 — 확인코드 일치 시 해당 행사의 운영사 메인 담당(PL)로 등록 */
export function OperatorRegisterForm() {
  const [state, action] = useFormState<OperatorRegisterState, FormData>(registerOperatorAction, undefined);

  if (state?.ok) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <p className="text-lg font-semibold">등록이 완료되었습니다</p>
        <p className="text-sm text-muted-foreground">
          <b>{state.programName}</b>의 운영사 총괄담당자로 등록되었습니다.
          <br />
          아이디 <b>{state.email}</b> 와 방금 정한 비밀번호로 로그인하세요.
        </p>
        <Button asChild className="mt-2 w-full">
          <Link href="/login">로그인하러 가기</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="r-name">이름 *</Label>
          <Input id="r-name" name="name" required autoComplete="name" placeholder="홍길동" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="r-position">직위 *</Label>
          <Input id="r-position" name="position" required autoComplete="off" placeholder="예: 팀장" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="r-email">이메일 (로그인 아이디) *</Label>
          <Input id="r-email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="r-phone">휴대폰 번호 *</Label>
          <Input id="r-phone" name="phone" required autoComplete="tel" placeholder="010-0000-0000" inputMode="tel" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="r-password">비밀번호 (8자 이상) *</Label>
          <Input id="r-password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="r-confirm">비밀번호 확인 *</Label>
          <Input id="r-confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="r-code">확인코드 *</Label>
          <Input id="r-code" name="code" required autoComplete="off" placeholder="운영사 내부 안내로 전달받은 코드" />
          <p className="text-[11px] text-muted-foreground">확인코드가 일치하는 행사의 운영사 총괄담당자로 등록됩니다.</p>
        </div>
      </div>

      {state?.ok === false && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <Submit />
      <p className="text-center text-xs text-muted-foreground">
        이미 계정이 있나요?{' '}
        <Link href="/login" className="text-primary underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
