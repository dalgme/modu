'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { setMentoringOutcomeAction } from '@/lib/workflow/mentoring-outcome-actions';
import { MENTORING_OUTCOME_LABELS, type MentoringCaseItem, type MentoringOutcome } from '@/lib/workflow/mentoring-outcome';

const OPTIONS: { key: MentoringOutcome | null; label: string; on: string }[] = [
  { key: null, label: '구분 없음', on: 'border-primary bg-primary text-primary-foreground' },
  { key: 'gave_up', label: MENTORING_OUTCOME_LABELS.gave_up, on: 'border-rose-600 bg-rose-600 text-white' },
  { key: 'ended', label: MENTORING_OUTCOME_LABELS.ended, on: 'border-emerald-600 bg-emerald-600 text-white' },
];

/** 멘토링 결과 배지 (명단 진행현황 칸) */
export function MentoringOutcomeBadge({ outcome, className }: { outcome: MentoringOutcome | null | undefined; className?: string }) {
  if (!outcome) return null;
  return (
    <Badge variant="outline" className={cn('w-fit text-[10px]', outcome === 'gave_up' ? 'border-rose-400 text-rose-700 dark:text-rose-300' : 'border-emerald-400 text-emerald-700 dark:text-emerald-300', className)}>
      {MENTORING_OUTCOME_LABELS[outcome]}
    </Badge>
  );
}

/**
 * 멘토링 포기 / 멘토링 종료 구분 (2026-11-03) — 회원 명단 > 멘티 > [정보 수정] · 비활성화 탭.
 * 케이스(라운드)마다 세 버튼 중 하나를 누른다. 케이스 상태·정산은 바뀌지 않고 리포트 [회차별 현황] 분류에 쓰인다.
 */
export function MentoringOutcomeControl({ cases, compact = false }: { cases: MentoringCaseItem[]; compact?: boolean }) {
  if (cases.length === 0) return compact ? <span className="text-xs text-muted-foreground">케이스 없음</span> : null;
  return (
    <div className={cn('flex flex-col gap-2', !compact && 'rounded-md border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30')}>
      {!compact && (
        <div>
          <div className="text-sm font-semibold">멘토링 포기 · 종료 구분</div>
          <p className="text-xs text-muted-foreground">
            멘토링을 중간에 그만둔 멘티는 [멘토링 포기], 멘토링을 마친 멘티는 [멘토링 종료]를 누르세요. 리포트 [회차별 현황]의 종료·포기 분류에 쓰이며, 케이스 진행 단계·정산은 바뀌지 않습니다.
          </p>
        </div>
      )}
      {cases.map((c) => (
        <OutcomeRow key={c.caseId} item={c} compact={compact} />
      ))}
    </div>
  );
}

function OutcomeRow({ item, compact }: { item: MentoringCaseItem; compact: boolean }) {
  const [value, setValue] = useState<MentoringOutcome | null>(item.outcome);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const pick = (next: MentoringOutcome | null) => {
    if (next === value || pending) return;
    const prev = value;
    setValue(next);
    start(async () => {
      const r = await setMentoringOutcomeAction(item.caseId, next);
      if (r.ok) {
        toast({ title: r.message });
        router.refresh();
      } else {
        setValue(prev);
        toast({ title: r.error, variant: 'destructive' });
      }
    });
  };
  return (
    <div className={cn('flex flex-wrap items-center gap-2', compact ? 'text-[11px]' : 'text-xs')}>
      <span className="min-w-0 font-medium">
        {item.groupName ?? '-'}
        <span className="ml-1 font-normal text-muted-foreground">
          {item.statusLabel} · 보고서 {item.roundsDone}/{item.requiredRounds}회
        </span>
      </span>
      <div role="radiogroup" aria-label={`${item.groupName ?? ''} 멘토링 구분`} className="flex flex-wrap gap-1">
        {OPTIONS.map((o) => {
          const active = value === o.key;
          return (
            <button
              key={o.key ?? 'none'}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => pick(o.key)}
              className={cn('rounded-full border px-2.5 font-semibold disabled:opacity-60', compact ? 'h-8 sm:h-7' : 'h-10 sm:h-8', active ? o.on : 'bg-background hover:bg-accent')}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
