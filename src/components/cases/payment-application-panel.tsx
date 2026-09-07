'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { draftPaymentAction } from '@/lib/workflow/payment-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

/** 넥스트랩 지급신청서 작성 패널 (지급계좌 본인명의 확인 + 완료보고서 기한 안내) */
export function PaymentApplicationPanel({ caseId }: { caseId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const result = await draftPaymentAction({
      caseId,
      bank_name: fd.get('bank_name'),
      account_number: fd.get('account_number'),
      account_holder: fd.get('account_holder'),
      amount: fd.get('amount'),
      account_confirmed: confirmed,
    });
    setBusy(false);
    if (result.ok) {
      toast({ title: '지급신청서가 작성되었습니다. (PDF 생성 포함)' });
      router.refresh();
    } else {
      toast({ title: '작성 실패', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">지급신청서 작성</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bank_name">은행명</Label>
              <Input id="bank_name" name="bank_name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account_holder">예금주 (대표자 본인)</Label>
              <Input id="account_holder" name="account_holder" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account_number">계좌번호</Label>
              <Input id="account_number" name="account_number" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">지급 금액</Label>
              <AmountInput id="amount" name="amount" placeholder="0" required />
            </div>
          </div>

          <div className="rounded-md border border-status-progress-bg bg-status-progress-bg/40 p-3 text-xs text-muted-foreground">
            ※ 지급계좌는 반드시 <b className="text-foreground">대표자 본인(또는 법인) 명의</b>여야
            합니다.
            <br />※ 완료보고서 제출기한: 선정통보 후 3개월 이내 (신청 시 자동 계산)
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="h-4 w-4"
            />
            지급계좌가 대표자 본인 명의임을 확인했습니다.
          </label>

          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !confirmed}>
              {busy ? '작성·PDF 생성 중…' : '지급신청서 작성'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
