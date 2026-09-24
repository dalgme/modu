'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Send, Trash2, Undo2, Wallet, X } from 'lucide-react';

import { ExcelButton } from '@/components/common/excel-button';
import { useConfirm, type ConfirmOptions } from '@/components/common/confirm-dialog';

import { confirmBatchAction, deleteBatchAction, markBatchPaidAction, removeFromBatchAction, submitBatchAction, unsubmitBatchAction } from '@/lib/settlement/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type ActionResult = { ok: true } | { ok: true; batchId: string } | { ok: false; error: string };

/** 품의 상세의 상태 전이 버튼 — role 에 따라 노출 (운영사: 제출·철회·삭제·지급 완료 / 발주처: 정산 확인) */
export function BatchActions({ batchId, status, role, exportHref, itemCount, totalNet, afterDeleteHref = '/nextlab/settlements' }: { batchId: string; status: string; role: 'nextlab' | 'institution'; exportHref: string; itemCount?: number; totalNet?: string; afterDeleteHref?: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();

  const summary = [itemCount !== undefined ? `정산 ${itemCount}건` : null, totalNet ? `실지급 ${totalNet}` : null].filter(Boolean).join(' · ');

  const run = async (opts: ConfirmOptions, doneLabel: string, fn: () => Promise<ActionResult>, after?: () => void) => {
    const ok = await confirm({ ...opts, impact: [...(summary ? [summary] : []), ...(opts.impact ?? [])] });
    if (!ok) return;
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: `${doneLabel} 완료` });
      after?.();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {dialog}
      <ExcelButton href={exportHref} />
      {role === 'nextlab' && status === 'draft' && (
        <>
          <Button size="sm" className="gap-1" disabled={pending} onClick={() => void run({ title: '발주처에 제출', description: '이 품의를 발주처에 제출합니다. 제출 후에는 편성 건을 바꿀 수 없으며, 발주처 정산 확인 전까지는 철회할 수 있습니다.', confirmLabel: '제출' }, '제출', () => submitBatchAction(batchId))}>
            <Send className="h-4 w-4" /> 제출
          </Button>
          <Button size="sm" variant="ghost" className="gap-1 text-destructive" disabled={pending} onClick={() => void run({ title: '품의 삭제', description: '이 품의를 삭제합니다. 편성된 정산 건은 지급 대기로 돌아갑니다.', impact: ['삭제는 되돌릴 수 없습니다(정산 건 자체는 유지).'], confirmLabel: '삭제', severity: 'danger' }, '품의 삭제', () => deleteBatchAction(batchId), () => router.push(afterDeleteHref))}>
            <Trash2 className="h-4 w-4" /> 삭제
          </Button>
        </>
      )}
      {role === 'nextlab' && status === 'submitted' && (
        <Button size="sm" variant="outline" className="gap-1" disabled={pending} onClick={() => void run({ title: '제출 철회', description: '발주처에 제출한 품의를 철회하고 작성 중 상태로 되돌립니다.', confirmLabel: '철회' }, '제출 철회', () => unsubmitBatchAction(batchId))}>
          <Undo2 className="h-4 w-4" /> 제출 철회
        </Button>
      )}
      {role === 'nextlab' && status === 'confirmed' && (
        <Button size="sm" className="gap-1" disabled={pending} onClick={() => void run({ title: '지급 완료 표시', description: '발주처 정산 확인이 끝난 품의를 지급 완료로 표시합니다.', impact: ['포함된 종결 정산 케이스는 종결로 확정됩니다.', '지급 완료 후에는 되돌릴 수 없습니다.'], confirmLabel: '지급 완료', severity: 'danger' }, '지급 완료 표시', () => markBatchPaidAction(batchId))}>
          <Wallet className="h-4 w-4" /> 지급 완료
        </Button>
      )}
      {role === 'institution' && status === 'submitted' && (
        <Button size="sm" className="gap-1" disabled={pending} onClick={() => void run({ title: '정산 확인', description: '운영사가 제출한 이 품의의 정산 내역을 확인합니다.', impact: ['포함된 종결 정산 케이스는 종결 확정됩니다.', '확인 후 운영사가 [지급 완료]를 표시합니다.'], confirmLabel: '정산 확인' }, '정산 확인', () => confirmBatchAction(batchId))}>
          <CheckCircle2 className="h-4 w-4" /> 정산 확인
        </Button>
      )}
    </div>
  );
}

export function RemoveFromBatchButton({ batchId, settlementId, label }: { batchId: string; settlementId: string; label?: string }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  return (
    <>
      {dialog}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        title="품의에서 제외"
        aria-label={`${label ?? '정산 건'} 품의에서 제외`}
        onClick={() =>
          void (async () => {
            const ok = await confirm({ title: '품의에서 제외', description: `${label ?? '이 정산 건'}을(를) 품의에서 제외합니다. 제외된 건은 지급 대기로 돌아갑니다.`, confirmLabel: '제외', severity: 'danger' });
            if (!ok) return;
            start(async () => {
              const r = await removeFromBatchAction(batchId, settlementId);
              toast(r.ok ? { title: '제외했습니다.' } : { title: r.error, variant: 'destructive' });
            });
          })()
        }
      >
        <X className="h-4 w-4" />
      </Button>
    </>
  );
}

/** 품의 상세 "← 정산 목록" — 목록에서 넘어올 때 붙은 `?tab=` 을 유지한다 (P30). */
export function BatchBackLink({ backHref, label = '← 정산 목록' }: { backHref: string; label?: string }) {
  const params = useSearchParams();
  const tab = params.get('tab');
  const href = tab && /^[a-z_-]+$/.test(tab) ? `${backHref}?tab=${tab}` : backHref;
  return (
    <Link href={href} className="text-sm text-muted-foreground hover:underline">
      {label}
    </Link>
  );
}
