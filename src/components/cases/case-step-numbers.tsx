import { cn } from '@/lib/utils';
import { CASE_STATUS_META, CASE_STEP_ORDER, statusStep, type CaseStatus } from '@/types/case-status';

const PITCH = 18; // 원 16px + 간격 2px

/** 표 셀용 1~7 단계 점 표시 — 현재 단계(강조색) 바로 위에 단계명을 붙인다 (P26-04) */
export function CaseStepNumbers({ status }: { status: CaseStatus }) {
  const current = statusStep(status);
  const meta = CASE_STATUS_META[status];
  const rejected = meta.tone === 'rejected';
  const idx = Math.max(0, CASE_STEP_ORDER.findIndex((s) => CASE_STATUS_META[s].step === current));
  const center = idx * PITCH + 8;
  return (
    <span className="relative inline-block pt-3.5" aria-label={`${current}단계 ${meta.short}`}>
      <span
        className={cn('absolute top-0 whitespace-nowrap text-[10px] font-bold leading-none', rejected ? 'text-status-rejected' : 'text-primary')}
        style={{ left: center, transform: 'translateX(-50%)' }}
      >
        {meta.short}
      </span>
      <span className="inline-flex items-center gap-0.5">
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
    </span>
  );
}
