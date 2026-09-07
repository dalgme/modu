'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Undo2 } from 'lucide-react';

import { reviewClosureAction } from '@/lib/settlement/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { SettlementSummary, type SettlementFigures } from '@/components/settlement/settlement-summary';

/**
 * 운영사 종결 검수 — T6 보완 요청 / T7 승인(+정산 확정).
 * 예상 정산액은 서버에서 computeSettlement 로 계산해 내려온다(확정과 같은 함수).
 */
export function ClosureReviewPanel({ caseId, estimates, observationUrl }: { caseId: string; estimates: { mentorName: string; figures: SettlementFigures; source: string }[]; observationUrl: string | null }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [comment, setComment] = useState('');

  const run = (result: 'approved' | 'revision_requested') => {
    if (result === 'revision_requested' && !comment.trim()) {
      toast({ title: '보완 요청 사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    const msg = result === 'approved' ? '검수를 승인하고 정산을 확정할까요? 확정 후 회차는 잠기며 멘토에게 통보됩니다.' : '보완을 요청할까요?';
    if (!confirm(msg)) return;
    start(async () => {
      const r = await reviewClosureAction(caseId, result, comment);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: result === 'approved' ? '검수 승인 · 정산 확정' : '보완을 요청했습니다.' });
      setComment('');
    });
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">종결 검수</CardTitle>
        <p className="text-xs text-muted-foreground">
          관찰의견서와 회차를 확인한 뒤 승인하면 아래 예상 금액이 그대로 확정 스냅샷으로 저장됩니다.
          {observationUrl && (
            <>
              {' '}
              <a href={observationUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                관찰의견서 열기
              </a>
            </>
          )}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {estimates.length === 0 ? (
          <p className="text-sm text-destructive">정산 대상 회차가 없습니다. 회차가 등록되어야 승인할 수 있습니다.</p>
        ) : (
          estimates.map((e) => (
            <div key={e.mentorName} className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-semibold">
                예상 정산 — {e.mentorName} <span className="text-xs font-normal text-muted-foreground">(원천징수 기준: {e.source})</span>
              </p>
              <SettlementSummary f={e.figures} />
            </div>
          ))
        )}
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="검수 의견 (보완 요청 시 필수)" rows={3} disabled={pending} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => run('revision_requested')} disabled={pending} className="gap-1">
            <Undo2 className="h-4 w-4" /> 보완 요청
          </Button>
          <Button onClick={() => run('approved')} disabled={pending || estimates.length === 0} className="gap-1">
            <CheckCircle2 className="h-4 w-4" /> 검수 승인 · 정산 확정
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
