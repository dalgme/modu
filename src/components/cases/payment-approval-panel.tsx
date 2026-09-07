'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { paymentApprovalAction } from '@/lib/workflow/payment-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

/** 진흥원 지급승인/반려 패널 */
export function PaymentApprovalPanel({ caseId }: { caseId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(result: 'approved' | 'rejected') {
    if (result === 'rejected' && !reason.trim()) {
      toast({ title: '반려 사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const res = await paymentApprovalAction({ caseId, result, reason: reason || undefined });
    setBusy(false);
    if (res.ok) {
      toast({ title: result === 'approved' ? '지급 승인 (케이스 종료)' : '반려되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '처리 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">지급신청서 승인/반려</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preason">반려 사유 (반려 시 필수)</Label>
          <Textarea
            id="preason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => submit('approved')} disabled={busy}>
            지급 승인
          </Button>
          <Button variant="destructive" onClick={() => submit('rejected')} disabled={busy}>
            반려
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
