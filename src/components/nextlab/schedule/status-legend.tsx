import { cn } from '@/lib/utils';
import {
  ROUND_STATUS_HELP,
  ROUND_STATUS_LABEL,
  ROUND_STATUS_ORDER,
  ROUND_STATUS_STYLE,
  UNREGISTERED_STYLE,
  type RoundStatus,
} from '@/lib/data/staff-schedule-shared';

/** 회차 상태 배지 — 서버·클라이언트 공용(훅 없음) */
export function RoundStatusBadge({ status, className }: { status: RoundStatus; className?: string }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none', ROUND_STATUS_STYLE[status], className)}>{ROUND_STATUS_LABEL[status]}</span>;
}

/** 상태 범례 — 예약 / 보고서 대기 / 완료 (+ 세부일정의 미등록) */
export function StatusLegend({ withUnregistered = false }: { withUnregistered?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {ROUND_STATUS_ORDER.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <RoundStatusBadge status={s} />
          {ROUND_STATUS_HELP[s]}
        </span>
      ))}
      {withUnregistered && (
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none', UNREGISTERED_STYLE)}>미등록</span>
          목표 회차 중 아직 계획도 등록되지 않은 회차
        </span>
      )}
    </div>
  );
}
