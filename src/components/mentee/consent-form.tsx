'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

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

/** 멘티 개인정보 동의 폼 (P28 — 멘토링 운영 기준 문안, 기관명은 행사 설정에서) */
export function ConsentForm({ programName, clientName, operatorName }: { programName: string; clientName: string; operatorName: string }) {
  const [agreed, setAgreed] = useState(false);
  // 대행 중 제출 등 서버가 돌려준 오류를 폼 아래에 표시 (P31)
  const [state, formAction] = useFormState(agreePrivacy, undefined);
  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">개인정보 수집·이용 동의</CardTitle>
        <CardDescription>{programName} 멘토링에 참여하기 위해 필요합니다. 아래 내용을 확인하고 동의에 체크해 주세요.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">1. 수집 항목</p>
          <p>이름·연락처(휴대폰·이메일)·소속·권역, 팀명·아이템(창업 아이디어) 설명·팀원 명단, 컨설팅 회차 기록(일시·참가자·보고서·사진)·확인 서명, 만족도 조사 응답, 제출 서류.</p>
          <p className="mt-3 font-medium text-foreground">2. 수집·이용 목적</p>
          <p>{programName} 멘토링 운영 — 멘토 매칭·배정, 회차 일정 안내와 진행 기록, 확인 서명·만족도 조사, 멘토 정산 증빙, 운영 통계·결과 보고({clientName} 제출), 문자·이메일 안내.</p>
          <p className="mt-3 font-medium text-foreground">3. 보유·이용 기간</p>
          <p>사업 종료 후 관련 법령·정산 규정에 따른 보관 기간(기본 3년) 경과 시 파기합니다.</p>
          <p className="mt-3 font-medium text-foreground">4. 제3자 제공</p>
          <p>담당 멘토(이름·연락처·아이템·팀 정보)와 발주기관 {clientName}(진행현황·결과) 범위에서 제공되며, 그 밖에는 제공하지 않습니다. 운영은 {operatorName}이 담당합니다.</p>
          <p className="mt-3 font-medium text-foreground">5. 동의 거부 권리</p>
          <p>동의를 거부할 수 있으나, 거부 시 본 멘토링 참여가 제한될 수 있습니다.</p>
        </div>
        <label className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-medium transition-colors', agreed ? 'border-primary bg-primary/5 text-foreground' : 'hover:bg-accent')}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="h-5 w-5 rounded border-input" />
          위 개인정보 수집·이용에 동의합니다.
        </label>
        <form action={formAction} className="flex flex-col gap-2">
          {state?.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
          <SubmitButton disabled={!agreed} />
        </form>
      </CardContent>
    </Card>
  );
}
