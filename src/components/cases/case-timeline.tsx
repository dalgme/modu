import { cn } from '@/lib/utils';
import type { Tables } from '@/types/database';
import { CASE_STATUS_META, CASE_STEP_ORDER, statusStep, type CaseStatus } from '@/types/case-status';
import { fmt, PLATFORM_BRANDING, type Branding } from '@/lib/programs/branding';
import { formatDateTime } from '@/lib/utils/format';

type HistoryRow = Tables<'case_status_history'>;

/** 케이스 상세 타임라인 — 7단계 + 상태 이력(노트 포함) */
export function CaseTimeline({
  status,
  history,
  branding = PLATFORM_BRANDING,
}: {
  status: CaseStatus;
  history: HistoryRow[];
  branding?: Branding;
}) {
  const current = statusStep(status);
  const meta = CASE_STATUS_META[status];
  const lastAt = new Map<CaseStatus, string>();
  for (const h of history) lastAt.set(h.to_status, h.created_at);

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {CASE_STEP_ORDER.map((s) => {
          const step = CASE_STATUS_META[s].step;
          const done = step < current;
          const isCurrent = step === current;
          const label = isCurrent ? fmt(meta.label, branding) : fmt(CASE_STATUS_META[s].label, branding);
          return (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                  done && 'bg-status-approved text-white',
                  isCurrent && (meta.tone === 'rejected' ? 'bg-status-rejected text-white' : 'bg-primary text-primary-foreground'),
                  !done && !isCurrent && 'bg-muted text-muted-foreground',
                )}
              >
                {step}
              </span>
              <span className={cn(isCurrent ? 'font-semibold' : done ? 'text-foreground' : 'text-muted-foreground')}>
                {label}
              </span>
              {(isCurrent || done) && lastAt.get(isCurrent ? status : s) && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDateTime(lastAt.get(isCurrent ? status : s)!)}
                </span>
              )}
            </li>
          );
        })}
        {status === 'withdrawn' && (
          <li className="flex items-center gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-rejected text-xs font-semibold text-white">
              ×
            </span>
            <span className="font-semibold text-status-rejected">{meta.label}</span>
            {lastAt.get('withdrawn') && (
              <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(lastAt.get('withdrawn')!)}</span>
            )}
          </li>
        )}
      </ol>

      {history.length > 0 && (
        <details className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium">상태 이력 {history.length}건</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                <span className="tabular-nums">{formatDateTime(h.created_at)}</span>
                <span className="text-foreground">{fmt(CASE_STATUS_META[h.to_status].label, branding)}</span>
                {h.note && <span>— {h.note}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
