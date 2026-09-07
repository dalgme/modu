import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  CASE_STEP_ORDER,
  CASE_STATUS_META,
  statusStep,
  APPROVAL_STEP,
  type CaseStatus,
} from '@/types/case-status';

interface CaseTimelineProps {
  status: CaseStatus;
}

/** 멘티 대시보드: 11단계 진행 타임라인 (현재 위치 시각화) */
export function CaseTimeline({ status }: CaseTimelineProps) {
  const current = statusStep(status);
  const isRejected = status === 'rejected';

  return (
    <ol className="relative flex flex-col gap-0">
      {CASE_STEP_ORDER.map((stepStatus, idx) => {
        const meta = CASE_STATUS_META[stepStatus];
        const isRejectionPoint = isRejected && meta.step === APPROVAL_STEP;
        const done = meta.step < current;
        const isCurrent = meta.step === current;
        const last = idx === CASE_STEP_ORDER.length - 1;

        const label = isRejectionPoint ? '진흥원 반려' : meta.label;

        return (
          <li key={stepStatus} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  isRejectionPoint &&
                    'border-status-rejected bg-status-rejected-bg text-status-rejected',
                  !isRejectionPoint &&
                    done &&
                    'border-status-approved bg-status-approved-bg text-status-approved',
                  !isRejectionPoint &&
                    isCurrent &&
                    'border-status-progress bg-status-progress-bg text-status-progress',
                  !isRejectionPoint &&
                    !done &&
                    !isCurrent &&
                    'border-border bg-muted text-muted-foreground',
                )}
              >
                {done && !isRejectionPoint ? <Check className="h-4 w-4" /> : meta.step}
              </span>
              {!last && (
                <span
                  className={cn('min-h-6 w-px flex-1', done ? 'bg-status-approved' : 'bg-border')}
                />
              )}
            </div>
            <div className={cn('pb-6 pt-0.5', last && 'pb-0')}>
              <p
                className={cn(
                  'text-sm font-medium',
                  isCurrent && 'text-status-progress',
                  isRejectionPoint && 'text-status-rejected',
                  !isCurrent && !isRejectionPoint && !done && 'text-muted-foreground',
                )}
              >
                {label}
              </p>
              {isCurrent && <p className="text-xs text-muted-foreground">현재 진행 단계</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
