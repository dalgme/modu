'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { changePassword, type ActionState } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full text-base" disabled={pending}>
      {pending ? '저장 중…' : '비밀번호 저장하고 시작하기'}
    </Button>
  );
}

export default function ChangePasswordPage() {
  const [state, formAction] = useFormState<ActionState, FormData>(changePassword, undefined);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">나만의 비밀번호 만들기</CardTitle>
          <CardDescription>
            처음 오셨네요! 안전을 위해 비밀번호를 한 번만 새로 정해 주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            처음 비밀번호는 <b className="text-foreground">휴대폰 번호</b>로 되어 있어 다른 사람이 알
            수 있어요. <b className="text-foreground">나만 아는 비밀번호</b>로 바꿔 주세요. 잊지 않게
            메모해 두셔도 좋습니다.
          </div>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">새 비밀번호</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
              <p className="text-xs text-muted-foreground">
                8자 이상으로 만들어 주세요. 기억하기 쉬운 것으로 하셔도 됩니다.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm">새 비밀번호 다시 입력</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
              />
              <p className="text-xs text-muted-foreground">
                확인을 위해 위와 똑같이 한 번 더 입력해 주세요.
              </p>
            </div>
            {state?.error && (
              <p className="text-sm font-medium text-destructive" role="alert">
                {state.error}
              </p>
            )}
            <SubmitButton />
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
