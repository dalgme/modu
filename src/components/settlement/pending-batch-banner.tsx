'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { batchPendingSettlementsAction } from '@/lib/settlement/actions';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatKRW } from '@/lib/utils/format';

/** (2026-11-16) 정산 건 탭 폐지 — 품의에 아직 오르지 않은 지급 대기 정산이 있으면 [품의로 올리기] */
export function PendingBatchBanner({ count, net, canRun }: { count: number; net: number; canRun: boolean }) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const { confirm, dialog } = useConfirm();
  const { toast } = useToast();
  const router = useRouter();
  const run = async () => {
    const ok = await confirm({
      title: '지급 대기 정산을 품의로 올릴까요?',
      description: '멘토별 지급 품의로 편성해 제출합니다. 올린 뒤 이 목록에서 [정산 확인]을 누르면 끝납니다.',
      impact: [`정산 ${count}건 · 실지급 ${formatKRW(net)}`, '회차를 고쳐야 하면 품의 상세에서 [검수로 되돌리기]로 뺄 수 있습니다.'],
      confirmLabel: '품의로 올리기',
    });
    if (!ok) return;
    start(async () => {
      const r = await batchPendingSettlementsAction();
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      setErrors(r.errors);
      toast({ title: r.message, variant: r.errors.length ? 'destructive' : undefined });
      router.refresh();
    });
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          검수는 끝났지만 아직 지급 품의에 오르지 않은 정산 <b>{count}건</b>({formatKRW(net)})이 있습니다. 품의로 올리면 아래 목록에서 정산 확인할 수 있습니다.
        </p>
        {canRun && (
          <Button size="sm" disabled={pending} onClick={() => void run()} className="gap-1">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} 품의로 올리기
          </Button>
        )}
      </div>
      {errors.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-red-700">
          {errors.slice(0, 5).map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
