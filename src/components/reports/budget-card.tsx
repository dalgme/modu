import type { BudgetOverview, BudgetRow } from '@/lib/reports/budget';
import { formatKRW } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

function Gauge({ row, big = false }: { row: BudgetRow; big?: boolean }) {
  const spent = row.confirmed + row.forecast;
  const hasBudget = row.budget !== null && row.budget > 0;
  const pctConfirmed = hasBudget ? Math.min(100, (row.confirmed / row.budget!) * 100) : 0;
  const pctForecast = hasBudget ? Math.min(100 - pctConfirmed, (row.forecast / row.budget!) * 100) : 0;
  const pct = hasBudget ? Math.round((spent / row.budget!) * 100) : null;
  const over = hasBudget && spent > row.budget!;
  return (
    <div className={cn('flex flex-col gap-1', big ? 'text-sm' : 'text-xs')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className={cn('font-semibold', big && 'text-base')}>{row.name}</span>
        <span className="tabular-nums text-muted-foreground">
          {hasBudget ? (
            <>
              집행 {formatKRW(spent)} / 예산 {formatKRW(row.budget!)}{' '}
              <b className={over ? 'text-destructive' : 'text-foreground'}>({pct}%)</b>
            </>
          ) : (
            <>집행 {formatKRW(spent)} · 예산 미설정</>
          )}
        </span>
      </div>
      {hasBudget && (
        <div className={cn('flex w-full overflow-hidden rounded-full bg-muted', big ? 'h-3.5' : 'h-2.5')} title={`확정 ${formatKRW(row.confirmed)} · 예상 ${formatKRW(row.forecast)}`}>
          <div className={over ? 'bg-destructive' : 'bg-emerald-600'} style={{ width: `${pctConfirmed}%` }} />
          <div className="bg-amber-400" style={{ width: `${pctForecast}%` }} />
        </div>
      )}
      <div className="flex gap-3 text-[11px] text-muted-foreground">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-600" />확정(정산) {formatKRW(row.confirmed)}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />예상(이행 회차) {formatKRW(row.forecast)}</span>
      </div>
    </div>
  );
}

/** 멘토링 예산 집행 게이지 (P22) — 지급총액(gross) 기준. 리포트·발주처 정산 화면 공용 */
export function BudgetCard({ overview, settingsHint = false }: { overview: BudgetOverview; settingsHint?: boolean }) {
  const groupsWithData = overview.groups.filter((g) => g.budget !== null || g.confirmed + g.forecast > 0);
  return (
    <section className="flex flex-col gap-4 rounded-xl border-2 bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">멘토링 예산 집행</h2>
        <span className="text-[11px] text-muted-foreground">지급총액(원천징수 공제 전) 기준{settingsHint ? ' · 예산 입력: 운영 설정 › 예산' : ''}</span>
      </div>
      <Gauge row={overview.total} big />
      {groupsWithData.length > 0 && (
        <div className="flex flex-col gap-3 border-t pt-3">
          {groupsWithData.map((g) => (
            <Gauge key={g.id} row={g} />
          ))}
        </div>
      )}
    </section>
  );
}
