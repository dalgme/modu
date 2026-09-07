import { cn } from '@/lib/utils';
import { CASE_STATUS_META, CASE_STEP_ORDER, statusStep, type CaseStatus } from '@/types/case-status';

/** 표 셀용 1~7 단계 점 표시 */
export function CaseStepNumbers({ status }: { status: CaseStatus }) {
  const current = statusStep(status);
  const rejected = CASE_STATUS_META[status].tone === 'rejected';
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${current}단계`}>
      {CASE_STEP_ORDER.map((s) => {
        const step = CASE_STATUS_META[s].step;
        return (
          <span
            key={s}
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold tabular-nums',
              step < current && 'bg-status-approved-bg text-status-approved',
              step === current && (rejected ? 'bg-status-rejected text-white' : 'bg-primary text-primary-foreground'),
              step > current && 'bg-muted text-muted-foreground',
            )}
          >
            {step}
          </span>
        );
      })}
    </span>
  );
}
