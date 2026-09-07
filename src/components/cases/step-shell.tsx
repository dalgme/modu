import type { ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';

import { cn } from '@/lib/utils';

export type StepState = 'done' | 'active' | 'locked';

/** 단계형 산출물 플로우 공용 셸 (번호 배지 + 완료/잠금 상태 + 제목/부제) */
export function StepShell({
  n,
  title,
  state,
  subtitle,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3.5',
        state === 'active' && 'border-primary/40 bg-primary/[0.03]',
        state === 'locked' && 'border-dashed opacity-70',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
            state === 'done' && 'bg-status-approved text-white',
            state === 'active' && 'bg-primary text-primary-foreground',
            state === 'locked' && 'bg-muted text-muted-foreground',
          )}
        >
          {state === 'done' ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {state === 'done' && (
              <span className="rounded-full bg-status-approved/15 px-2 py-0.5 text-[11px] font-medium text-status-approved">
                완료
              </span>
            )}
            {state === 'locked' && <Lock className="h-3 w-3 text-muted-foreground" />}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          <div className="mt-2.5">{children}</div>
        </div>
      </div>
    </div>
  );
}
