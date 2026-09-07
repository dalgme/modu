'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { reviewAction } from '@/lib/workflow/application-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PdfViewButton } from '@/components/cases/pdf-view-button';
import { useToast } from '@/hooks/use-toast';

/** 넥스트랩 검수 패널 (승인 / 보완요청) */
export function ReviewPanel({ caseId }: { caseId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(result: 'approved' | 'revision_requested') {
    setBusy(true);
    const res = await reviewAction({ caseId, result, comment });
    setBusy(false);
    if (res.ok) {
      toast({
        title: result === 'approved' ? '검수 완료 (진흥원 승인 대기)' : '보완요청 되었습니다.',
      });
      router.refresh();
    } else {
      toast({ title: '처리 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">지원신청서 검수</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <PdfViewButton caseId={caseId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="comment">검수 의견 (보완요청 시 권장)</Label>
          <Textarea
            id="comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => submit('approved')} disabled={busy}>
            검수 승인
          </Button>
          <Button variant="outline" onClick={() => submit('revision_requested')} disabled={busy}>
            보완요청
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
