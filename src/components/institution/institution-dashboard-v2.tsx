import Link from 'next/link';
import { AlertTriangle, ArrowRight, ClipboardCheck, ClipboardList, Coins, FileSpreadsheet, FolderDown, Layers, TrendingUp, Users, type LucideIcon } from 'lucide-react';

import type { ProgramMetrics } from '@/lib/reports/metrics';
import type { BudgetOverview } from '@/lib/reports/budget';
import type { TrendMonth } from '@/lib/reports/trend';
import type { Branding } from '@/lib/programs/branding';
import { fmt } from '@/lib/programs/branding';
import { formatKRW } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import { BudgetCard } from '@/components/reports/budget-card';
import { GroupProgress, Kpi, KpiBand, MonthlyBars, Panel, Ring, SettlementPipeline, StatusBars, pct } from '@/components/reports/dashboard-charts';
import { OperatorRequestGeneralButton } from '@/components/cases/operator-request-general-button';

/**
 * 발주처 대시보드 v2 (2026-10-01) — 운영사 대시보드와 같은 구성:
 *  ① 지금 확인 (정산이 필요한 건수 = 주황 테두리 대표 카드 + 진행 알림 카드)
 *  ② 핵심 지표 밴드 · ③ 차트 4종 · ④ 예산 · ⑤ 바로가기
 * '수행 성과'·'비수행 잔여 과업' 숫자 타일은 두지 않는다(사용자 결정). 수치는 metrics/budget/trend 단일 함수 결과.
 */
export interface InstitutionDashboardV2Props {
  branding: Branding;
  scopeLabel: string;
  metrics: ProgramMetrics;
  budget: BudgetOverview;
  trend: TrendMonth[];
  settlementNeeded: { mentors: number; settlements: number; batches: number; net: number };
  delays: number;
}

function MiniCard({ icon: Icon, label, value, unit = '건', sub, href, tone }: { icon: LucideIcon; label: string; value: number; unit?: string; sub: string; href: string; tone: 'navy' | 'red' | 'violet' }) {
  const on = value > 0;
  const toneCls = { navy: 'border-midnight/40 bg-midnight/5', red: 'border-status-rejected/50 bg-status-rejected/10', violet: 'border-violet-400 bg-violet-50/80 dark:bg-violet-950/30' }[tone];
  const iconCls = { navy: 'bg-midnight text-white', red: 'bg-status-rejected text-white', violet: 'bg-violet-500 text-white' }[tone];
  return (
    <Link href={href} className={cn('flex flex-col gap-2 rounded-2xl border-2 p-4 shadow-sm transition-colors hover:border-primary', on ? toneCls : 'bg-background')}>
      <span className="flex items-center gap-2">
        <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg', on ? iconCls : 'bg-muted text-muted-foreground')}><Icon className="h-4 w-4" /></span>
        <span className="text-sm font-semibold">{label}</span>
      </span>
      <span className="flex items-end gap-1.5">
        <span className={cn('text-3xl font-extrabold leading-none tabular-nums', !on && 'text-muted-foreground')}>{value}</span>
        <span className="pb-0.5 text-xs text-muted-foreground">{unit}</span>
      </span>
      <span className="text-[11px] leading-snug text-muted-foreground">{sub}</span>
    </Link>
  );
}

const SHORTCUTS: { href: string; label: string; icon: LucideIcon; desc: string }[] = [
  { href: '/institution/settlements', label: '정산 확인', icon: Coins, desc: '제출된 지급 품의 확인 · 반려' },
  { href: '/institution/reports?tab=overview', label: '리포트 개요', icon: TrendingUp, desc: '핵심 지표 · 차트 · 지연 케이스' },
  { href: '/institution/reports?tab=cases', label: '멘티 진행현황', icon: ClipboardList, desc: '멘티별 단계 · 회차 · 멘토' },
  { href: '/institution/reports?tab=cases&view=mentor', label: '멘토 진행현황', icon: Users, desc: '멘토별 담당 멘티 · 실지급 · 만족도' },
  { href: '/institution/reports?tab=groups', label: '그룹 실적', icon: Layers, desc: '라운드별 케이스 · 회차 · 종결' },
  { href: '/institution/reports?tab=files', label: '보고서 파일', icon: FolderDown, desc: '회차 보고서 · 관찰의견서 미리보기 · ZIP' },
  { href: '/institution/reports/summary', label: '종합결과리포트', icon: FileSpreadsheet, desc: '운영사가 공유한 결과 보고서' },
];

export function InstitutionDashboardV2(p: InstitutionDashboardV2Props) {
  const m = p.metrics;
  const perf = m.performance;
  const active = perf.cases - perf.byStatus.withdrawn;
  const unassigned = perf.byStatus.registered + perf.byStatus.reassignment_pending;
  const assigned = Math.max(0, active - unassigned);
  const reviewing = perf.byStatus.closure_requested + perf.byStatus.revision_requested;
  const need = p.settlementNeeded;
  const needOn = need.settlements > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{fmt('{client} 대시보드', p.branding)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{p.scopeLabel} — 정산 확인할 품의와 멘토링 진행 상황을 한눈에.</p>
        </div>
        <OperatorRequestGeneralButton />
      </div>

      {/* ① 지금 확인 */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
        <Link
          href="/institution/settlements"
          className={cn(
            'group flex flex-col gap-3 rounded-2xl border-[3px] border-orange-500 p-5 shadow-sm transition-colors',
            needOn ? 'bg-orange-50 hover:bg-orange-100/70 dark:bg-orange-950/30' : 'bg-background hover:bg-accent/40',
          )}
          aria-label={`정산이 필요한 건수 멘토 ${need.mentors}명, 총 ${need.settlements}건 — 정산 확인 화면으로 이동`}
        >
          <span className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 text-white"><Coins className="h-5 w-5" /></span>
            <span className="text-base font-bold">정산이 필요한 건수</span>
            {needOn && <span className="ml-auto rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-bold text-white">확인 필요</span>}
          </span>
          <span className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="text-4xl font-extrabold leading-none tabular-nums text-orange-600 dark:text-orange-400 sm:text-5xl">
              {need.mentors}
              <span className="ml-1 text-base font-bold text-foreground">명</span>
            </span>
            <span className="pb-1 text-2xl font-bold text-muted-foreground">/</span>
            <span className="text-4xl font-extrabold leading-none tabular-nums sm:text-5xl">
              {need.settlements}
              <span className="ml-1 text-base font-bold">건</span>
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            멘토 인원 / 총 정산 건수 · 제출된 지급 품의 {need.batches}건 · 실지급 합계 <b className="text-foreground">{formatKRW(need.net)}</b>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-orange-700 group-hover:underline dark:text-orange-300">
            {needOn ? '자세한 내역 보고 정산 확인하기' : '정산 확인 화면 열기'} <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniCard icon={Users} label="멘토 배정 대기" value={unassigned} sub="새로 등록됐거나 재배정이 필요한 멘티" href="/institution/reports?tab=cases&status=registered" tone="navy" />
          <MiniCard icon={AlertTriangle} label="지연 케이스" value={p.delays} sub="배정·첫 회차·장기 무진행·보완 지연" href="/institution/reports?tab=overview#delays" tone="red" />
          <MiniCard icon={ClipboardCheck} label="종결 검수 중" value={reviewing} sub={fmt('{operator} 검수 대기 · 보완 진행', p.branding)} href="/institution/reports?tab=cases&status=closure_requested" tone="violet" />
        </div>
      </section>

      {/* ② 핵심 지표 */}
      <KpiBand title={`핵심 지표 · ${p.scopeLabel}`} action={<Link href="/institution/reports" className="text-xs text-brand-teal hover:underline">리포트 전체 →</Link>}>
        <Kpi label="멘티 케이스" value={perf.cases} sub={`진행 ${active} · 종결 ${perf.closed} · 중도 ${perf.byStatus.withdrawn}`} />
        <Ring value={pct(assigned, active)} label={`멘토 배정률 (${assigned}/${active})`} />
        <Ring value={pct(perf.roundsDone, perf.roundsPlanned)} label={`회차 이행률 (${perf.roundsDone}/${perf.roundsPlanned})`} color="#60A5FA" />
        <Ring value={Math.round(perf.closureRate * 100)} label={`종결률 (${perf.closed}/${perf.cases})`} color="#A78BFA" />
        <Kpi label="만족도 평균" value={m.evaluation.surveyAvg ?? '-'} sub={`응답 ${m.evaluation.surveyResponses}건`} />
        <Kpi wide label="정산 확인 완료" value={formatKRW(m.settlement.confirmedNet + m.settlement.paidNet)} sub={`지급 완료 ${formatKRW(m.settlement.paidNet)}`} />
      </KpiBand>

      {/* ③ 차트 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="진행 단계 분포" sub="멘티 케이스가 어느 단계에 있는지 — 붉은 막대는 조치가 필요한 단계">
          <StatusBars m={m} />
        </Panel>
        <Panel title="라운드(그룹)별 진행" sub="케이스 · 배정 · 미배정 · 종결과 회차 이행률">
          <GroupProgress m={m} />
        </Panel>
        <Panel title="정산 파이프라인" sub="예상(미확정 이행 회차) → 지급 대기 → 품의 → 정산 확인 → 지급 완료">
          <SettlementPipeline m={m} />
        </Panel>
        <Panel title="월별 이행 회차 (최근 12개월)" sub="보고서까지 등록된 회차 기준">
          <MonthlyBars months={p.trend} />
        </Panel>
      </div>

      {/* ④ 예산 */}
      <BudgetCard overview={p.budget} />

      {/* ⑤ 바로가기 */}
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-bold">바로가기</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {SHORTCUTS.map((s) => (
            <Link key={s.href} href={s.href} className="group flex items-start gap-3 rounded-xl border-2 bg-background p-3 transition-colors hover:border-primary hover:bg-primary/5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-midnight text-white group-hover:bg-primary"><s.icon className="h-4 w-4" /></span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-[11px] text-muted-foreground">{s.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
