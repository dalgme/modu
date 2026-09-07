'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

import { agreePrivacy } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full text-base" disabled={disabled || pending}>
      {pending ? '처리 중…' : '동의하고 시작하기'}
    </Button>
  );
}

export default function ConsentPage() {
  const [agreed, setAgreed] = useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg">개인정보 수집·이용 동의</CardTitle>
          <CardDescription>
            멘토링 프로그램을 함께 진행하기 위해 필요합니다. 아래 내용을 확인하고 동의에 체크해 주세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">1. 수집 항목</p>
            <p>
              업체명·대표자·사업자등록번호·연락처·주소·이메일 등 접수신청서 기재 정보,
              서류·서명·사진.
            </p>
            <p className="mt-3 font-medium text-foreground">2. 수집·이용 목적</p>
            <p>멘토링 프로그램 케이스 처리(멘토링·서류 검수·지원/지급 신청·승인) 및 관련 통보.</p>
            <p className="mt-3 font-medium text-foreground">3. 보유·이용 기간</p>
            <p>사업 종료 후 관련 법령·정산 규정에 따른 보관 기간(기본 3년) 경과 시 파기.</p>
            <p className="mt-3 font-medium text-foreground">4. 동의 거부 권리</p>
            <p>동의를 거부할 수 있으나, 거부 시 본 사업 참여가 제한될 수 있습니다.</p>
          </div>
          <label
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-medium transition-colors',
              agreed ? 'border-primary bg-primary/5 text-foreground' : 'hover:bg-accent',
            )}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="h-5 w-5 rounded border-input"
            />
            위 개인정보 수집·이용에 동의합니다.
          </label>
          <form action={agreePrivacy}>
            <SubmitButton disabled={!agreed} />
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
