import { cn } from '@/lib/utils';
import { CASE_STATUS_META, CASE_STEP_ORDER, statusStep, type CaseStatus } from '@/types/case-status';
import { fmt, PLATFORM_BRANDING, type Branding } from '@/lib/programs/branding';

/**
 * 7단계 진행바. 접힌 상태(재배정 대기·보완 요청)는 같은 단계 위에 반려 톤으로, 중도 종료는 전체 흐림.
 */
export function ProcessStepBar({
  status,
  branding = PLATFORM_BRANDING,
  compact = false,
}: {
  status: CaseStatus;
  branding?: Branding;
  compact?: boolean;
}) {
  const current = statusStep(status);
  const meta = CASE_STATUS_META[status];
  const withdrawn = status === 'withdrawn';
  const rejectedTone = meta.tone === 'rejected' && !withdrawn;

  return (
    <ol className={cn('flex w-full items-center gap-1', withdrawn && 'opacity-50')} aria-label="진행 단계">
      {CASE_STEP_ORDER.map((s) => {
        const step = CASE_STATUS_META[s].step;
        const done = step < current;
        const isCurrent = step === current;
        return (
          <li key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span
              className={cn(
                'h-1.5 w-full rounded-full',
                done && 'bg-status-approved',
                isCurrent && (rejectedTone ? 'bg-status-rejected' : 'bg-primary'),
                !done && !isCurrent && 'bg-muted',
              )}
            />
            {!compact && (
              <span
                className={cn(
                  'truncate text-[10px] leading-tight',
                  isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
                title={fmt(CASE_STATUS_META[s].label, branding)}
              >
                {step}. {CASE_STATUS_META[s].short}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
