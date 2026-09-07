'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { approvalAction } from '@/lib/workflow/application-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PdfViewButton } from '@/components/cases/pdf-view-button';
import { useToast } from '@/hooks/use-toast';

/** 진흥원 승인/반려 패널 (반려 시 사유 필수) */
export function ApprovalPanel({ caseId }: { caseId: string }) {
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
    const res = await approvalAction({ caseId, result, reason: reason || undefined });
    setBusy(false);
    if (res.ok) {
      toast({ title: result === 'approved' ? '승인되었습니다. (통보 예약)' : '반려되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '처리 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">지원신청서 승인/반려</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <PdfViewButton caseId={caseId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reason">반려 사유 (반려 시 필수)</Label>
          <Textarea
            id="reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => submit('approved')} disabled={busy}>
            승인
          </Button>
          <Button variant="destructive" onClick={() => submit('rejected')} disabled={busy}>
            반려
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
