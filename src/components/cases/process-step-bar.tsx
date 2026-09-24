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

  const total = CASE_STEP_ORDER.length;
  const stateLabel = withdrawn ? '종료' : rejectedTone ? '조치 필요' : current >= total ? '완료' : '진행 중';
  return (
    <div className={cn('flex w-full flex-col gap-1', withdrawn && 'opacity-50')}>
    {/* (P31) 폰: 7개 라벨 대신 "현재 단계 · n/7 · 진행 중" 한 줄 (막대는 그대로) */}
    {!compact && (
      <p className="flex items-center justify-between text-xs sm:hidden">
        <span className={cn('font-semibold', rejectedTone ? 'text-status-rejected' : 'text-foreground')}>{fmt(meta.label, branding)}</span>
        <span className="tabular-nums text-muted-foreground">{current}/{total} · {stateLabel}</span>
      </p>
    )}
    <ol className="flex w-full items-center gap-1" aria-label="진행 단계">
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
                  'hidden truncate text-[10px] leading-tight sm:inline',
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
    </div>
  );
}
