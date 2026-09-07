'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Download, Send, Trash2, Undo2, Wallet, X } from 'lucide-react';

import { confirmBatchAction, deleteBatchAction, markBatchPaidAction, removeFromBatchAction, submitBatchAction, unsubmitBatchAction } from '@/lib/settlement/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/** 품의 상세의 상태 전이 버튼 — role 에 따라 노출 (운영사: 제출·철회·삭제·지급 완료 / 발주처: 정산 확인) */
export function BatchActions({ batchId, status, role, exportHref }: { batchId: string; status: string; role: 'nextlab' | 'institution'; exportHref: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (label: string, fn: () => Promise<{ ok: true } | { ok: true; batchId: string } | { ok: false; error: string }>, after?: () => void) => {
    if (!confirm(`${label}할까요?`)) return;
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: `${label} 완료` });
      after?.();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm" className="gap-1">
        <a href={exportHref}>
          <Download className="h-4 w-4" /> 엑셀 내보내기
        </a>
      </Button>
      {role === 'nextlab' && status === 'draft' && (
        <>
          <Button size="sm" className="gap-1" disabled={pending} onClick={() => run('발주처에 제출', () => submitBatchAction(batchId))}>
            <Send className="h-4 w-4" /> 제출
          </Button>
          <Button size="sm" variant="ghost" className="gap-1 text-destructive" disabled={pending} onClick={() => run('품의 삭제(편성 건은 지급 대기로 복귀)', () => deleteBatchAction(batchId), () => router.push('/nextlab/settlements'))}>
            <Trash2 className="h-4 w-4" /> 삭제
          </Button>
        </>
      )}
      {role === 'nextlab' && status === 'submitted' && (
        <Button size="sm" variant="outline" className="gap-1" disabled={pending} onClick={() => run('제출 철회', () => unsubmitBatchAction(batchId))}>
          <Undo2 className="h-4 w-4" /> 제출 철회
        </Button>
      )}
      {role === 'nextlab' && status === 'confirmed' && (
        <Button size="sm" className="gap-1" disabled={pending} onClick={() => run('지급 완료 표시', () => markBatchPaidAction(batchId))}>
          <Wallet className="h-4 w-4" /> 지급 완료
        </Button>
      )}
      {role === 'institution' && status === 'submitted' && (
        <Button size="sm" className="gap-1" disabled={pending} onClick={() => run('정산 확인(포함된 종결 정산 케이스는 종결 확정)', () => confirmBatchAction(batchId))}>
          <CheckCircle2 className="h-4 w-4" /> 정산 확인
        </Button>
      )}
    </div>
  );
}

export function RemoveFromBatchButton({ batchId, settlementId }: { batchId: string; settlementId: string }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      title="품의에서 제외"
      onClick={() =>
        start(async () => {
          const r = await removeFromBatchAction(batchId, settlementId);
          toast(r.ok ? { title: '제외했습니다.' } : { title: r.error, variant: 'destructive' });
        })
      }
    >
      <X className="h-4 w-4" />
    </Button>
  );
}
