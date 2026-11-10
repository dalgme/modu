'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { settlePriorMentorsBacklogAction } from '@/lib/settlement/actions';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/**
 * 정산·품의 화면 — 밀려 있는 선행 멘토 정산 안내 + [정산 진행] (2026-11-10).
 * 멘토가 중간에 바뀐 멘티에서 이전 멘토의 회차 정산이 아직 품의로 넘어가지 않은 경우에만 보인다.
 */
export function PriorMentorBacklog({ cases, unsettledRounds, pendingPartials, canRun }: { cases: number; unsettledRounds: number; pendingPartials: number; canRun: boolean }) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const { confirm, dialog } = useConfirm();
  const { toast } = useToast();
  const router = useRouter();

  const run = async () => {
    const ok = await confirm({
      title: '선행 멘토 정산 진행',
      description: '멘토가 중간에 바뀐 멘티에서, 이전 멘토가 보고서까지 등록한 회차를 정산하고 지급 품의를 자동으로 만들어 제출합니다.',
      impact: [
        `대상 멘티 ${cases}명`,
        ...(unsettledRounds > 0 ? [`아직 정산되지 않은 이전 멘토 회차 ${unsettledRounds}건 → 부분 정산 확정`] : []),
        ...(pendingPartials > 0 ? [`지급 대기 중인 이전 멘토 부분 정산 ${pendingPartials}건 → 품의 편성·제출`] : []),
        '멘티의 진행 단계와 새 멘토의 회차는 바뀌지 않습니다',
      ],
      confirmLabel: '정산 진행',
    });
    if (!ok) return;
    start(async () => {
      const r = await settlePriorMentorsBacklogAction();
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: r.message });
      setErrors(r.errors);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <b>선행 멘토 정산이 밀려 있습니다</b> — 멘토가 중간에 바뀐 멘티 {cases}명
          {unsettledRounds > 0 && ` · 미정산 회차 ${unsettledRounds}건`}
          {pendingPartials > 0 && ` · 품의 전 부분 정산 ${pendingPartials}건`}
        </p>
        {canRun && (
          <Button size="sm" onClick={run} disabled={pending} className="h-8 gap-1">
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            정산 진행
          </Button>
        )}
      </div>
      <p className="text-xs opacity-80">이전 멘토는 그 멘티에 대한 멘토링이 이미 끝났으므로, 새 멘토의 남은 회차를 기다리지 않고 진행한 회차만큼 바로 정산합니다. 앞으로 멘토를 바꾸거나 중도 종료를 승인하면 자동으로 처리됩니다.</p>
      {errors.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
