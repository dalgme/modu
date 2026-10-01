import type { ProgramMetrics } from '@/lib/reports/metrics';
import type { TrendMonth } from '@/lib/reports/trend';
import { CASE_STATUSES, CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { formatKRW } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/**
 * 대시보드·리포트 개요 공용 차트 조각 (2026-10-01, 운영사 대시보드 v2 에서 분리).
 * 훅·이벤트 핸들러가 없어 서버·클라이언트 컴포넌트 어디서든 쓸 수 있다(§6-10).
 * 수치는 전부 metrics/trend 단일 함수 결과를 그대로 그린다(여기서 재계산하지 않는다).
 */

const TONE_BAR: Record<string, string> = { pending: 'bg-amber-400', progress: 'bg-sky-500', approved: 'bg-emerald-500', rejected: 'bg-status-rejected' };
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export function Ring({ value, label, color = '#2AD1BF' }: { value: number; label: string; color?: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3">
      <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0">
        <circle cx="34" cy="34" r={r} stroke="rgba(255,255,255,0.18)" strokeWidth="8" fill="none" />
        <circle cx="34" cy="34" r={r} stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 34 34)" />
        <text x="34" y="38" textAnchor="middle" fontSize="14" fontWeight="800" fill="white">{v}%</text>
      </svg>
      <span className="text-xs text-midnight-foreground/80">{label}</span>
    </div>
  );
}

export function Kpi({ label, value, sub, wide = false }: { label: string; value: string | number; sub?: string; /** (P31) 금액처럼 긴 값 — 폰에서 2칸 차지 + 글자 축소 */ wide?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-0.5', wide && 'col-span-2 md:col-span-1')}>
      <span className="text-xs text-midnight-foreground/70">{label}</span>
      <span className={cn('font-extrabold leading-tight tabular-nums text-white', wide ? 'text-xl sm:text-3xl' : 'text-2xl sm:text-3xl')}>{value}</span>
      {sub && <span className="text-[11px] text-midnight-foreground/70">{sub}</span>}
    </div>
  );
}


export function Panel({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-2xl border-2 bg-background p-4', className)}>
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

export function StatusBars({ m }: { m: ProgramMetrics }) {
  const total = m.performance.cases || 1;
  const max = Math.max(...CASE_STATUSES.map((s) => m.performance.byStatus[s]), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {CASE_STATUSES.map((s: CaseStatus) => {
        const n = m.performance.byStatus[s];
        const meta = CASE_STATUS_META[s];
        return (
          <div key={s} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-xs">
            <span className={cn('truncate', n === 0 && 'text-muted-foreground')}>{meta.short}</span>
            <div className="h-4 overflow-hidden rounded bg-muted">
              <div className={cn('h-full rounded', TONE_BAR[meta.tone])} style={{ width: `${(n / max) * 100}%` }} />
            </div>
            <span className="text-right tabular-nums"><b>{n}</b> <span className="text-muted-foreground">({pct(n, total)}%)</span></span>
          </div>
        );
      })}
    </div>
  );
}

export function GroupProgress({ m }: { m: ProgramMetrics }) {
  if (m.groups.length === 0) return <p className="text-xs text-muted-foreground">그룹이 없습니다.</p>;
  return (
    <div className="flex flex-col gap-3">
      {m.groups.map((g) => {
        const unassigned = g.byStatus.registered + g.byStatus.reassignment_pending;
        const assigned = g.cases - unassigned - g.byStatus.withdrawn;
        const roundPct = pct(g.roundsDone, g.roundsPlanned);
        return (
          <div key={g.id} className="flex flex-col gap-1 text-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{g.name}</span>
              <span className="tabular-nums text-muted-foreground">케이스 <b className="text-foreground">{g.cases}</b> · 배정 <b className="text-foreground">{assigned}</b>{unassigned > 0 && <span className="text-status-rejected"> · 미배정 {unassigned}</span>} · 종결 <b className="text-foreground">{g.closed}</b></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
                <div className="h-full rounded bg-brand-teal" style={{ width: `${roundPct}%` }} />
              </div>
              <span className="w-28 text-right tabular-nums">회차 {g.roundsDone}/{g.roundsPlanned} ({roundPct}%)</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SettlementPipeline({ m }: { m: ProgramMetrics }) {
  const s = m.settlement;
  const stages = [
    { label: '예상(미확정)', value: s.estimatedGross, cls: 'bg-muted-foreground/40' },
    { label: '지급 대기', value: s.pendingNet, cls: 'bg-amber-400' },
    { label: '품의 편성', value: s.batchedNet, cls: 'bg-sky-500' },
    { label: '정산 확인', value: s.confirmedNet, cls: 'bg-violet-500' },
    { label: '지급 완료', value: s.paidNet, cls: 'bg-emerald-500' },
  ];
  const max = Math.max(...stages.map((x) => x.value), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {stages.map((x) => (
        <div key={x.label} className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-2 text-xs">
          <span>{x.label}</span>
          <div className="h-4 overflow-hidden rounded bg-muted"><div className={cn('h-full rounded', x.cls)} style={{ width: `${(x.value / max) * 100}%` }} /></div>
          <span className="text-right font-semibold tabular-nums">{formatKRW(x.value)}</span>
        </div>
      ))}
      <p className="mt-1 text-[11px] text-muted-foreground">원천징수 합계 {formatKRW(s.withholdingTotal)}</p>
    </div>
  );
}


/** 월별 이행 회차 막대 (값 라벨 상시 — 폰은 hover 가 없다) */
export function MonthlyBars({ months, compact = false, emptyText = '아직 이행 회차가 없습니다.' }: { months: TrendMonth[]; compact?: boolean; emptyText?: string }) {
  const max = Math.max(...months.map((d) => d.rounds), 1);
  const total = months.reduce((a, d) => a + d.rounds, 0);
  if (total === 0) return <p className="py-6 text-center text-xs text-muted-foreground">{emptyText}</p>;
  return (
    <div className={cn('flex h-36 items-end gap-1', compact && 'mx-auto w-24')}>
      {months.map((d, i) => (
        <div key={d.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-0.5" title={`${d.month} · 회차 ${d.rounds}건 · 신규 ${d.newCases} · 종결 ${d.closedCases}`}>
          <span className={cn('text-[9px] font-semibold tabular-nums leading-none text-muted-foreground', d.rounds === 0 && 'invisible', i !== months.length - 1 && 'opacity-70')}>{d.rounds}</span>
          <div className="w-full rounded-t bg-sky-500 transition-opacity group-hover:opacity-80" style={{ height: `${Math.max(d.rounds > 0 ? 4 : 1, (d.rounds / max) * 100)}%` }} />
          <span className="text-[9px] leading-none text-muted-foreground">{Number(d.month.slice(5, 7))}월</span>
        </div>
      ))}
    </div>
  );
}

/** 짙은 청색 핵심 지표 밴드 틀 */
export function KpiBand({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-midnight p-5 text-midnight-foreground shadow">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-6">{children}</div>
    </section>
  );
}
