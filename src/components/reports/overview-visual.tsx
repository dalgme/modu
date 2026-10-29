import Link from 'next/link';

import type { ProgramMetrics } from '@/lib/reports/metrics';
import type { TrendMonth } from '@/lib/reports/trend';
import { formatKRW } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import { GroupProgress, Kpi, KpiBand, MonthlyBars, Panel, Ring, SettlementPipeline, StatusBars, pct } from '@/components/reports/dashboard-charts';

/**
 * 리포트 [개요] 탭 (2026-10-01 업그레이드) — 숫자 타일 나열(MetricsTiles) 대신 대시보드와 같은 시각 구성:
 *  핵심 지표 밴드(링 게이지) → 점검 항목 띠(0이 아닌 것만 색) → 차트 4종(단계 분포·라운드별·정산 파이프라인·월별 회차).
 * 운영사·발주처 공용 — 발주처에는 운영사 내부 평가를 보이지 않는다. 수치는 metrics/trend 그대로.
 */
export function OverviewVisual({ m, base, trend, scopeLabel }: { m: ProgramMetrics; base: '/nextlab' | '/institution'; trend?: TrendMonth[]; scopeLabel: string }) {
  const p = m.performance;
  const b = m.backlog;
  const e = m.evaluation;
  const s = m.settlement;
  const reportsHref = `${base}/reports`;
  const active = p.cases - p.byStatus.withdrawn;
  const unassigned = p.byStatus.registered + p.byStatus.reassignment_pending;
  const assigned = Math.max(0, active - unassigned);
  const checks: { label: string; value: number | string; on: boolean; href: string; sub?: string }[] = [
    { label: '미배정', value: b.unassigned, on: b.unassigned > 0, href: base === '/nextlab' ? '/nextlab/roster?tab=mentee-match&filter=unassigned' : `${reportsHref}?tab=cases&status=registered` },
    { label: '잔여 회차', value: b.remainingRounds, on: false, href: `${reportsHref}?tab=cases`, sub: `정체 ${b.stalled}건 (${b.stalledDays}일 무회차)` },
    { label: '검수 대기 / 보완 중', value: `${b.reviewPending} / ${b.revisionRequested}`, on: b.reviewPending + b.revisionRequested > 0, href: `${reportsHref}?tab=cases&status=closure_requested` },
    { label: '재배정 대기', value: b.reassignmentPending, on: b.reassignmentPending + b.pendingRequests > 0, href: base === '/nextlab' ? '/nextlab/board?tab=requests' : `${reportsHref}?tab=cases`, sub: `미처리 요청 ${b.pendingRequests}건` },
    { label: '미서명 회차 / 미응답 설문', value: `${b.unsignedRounds} / ${b.unansweredSurveys}`, on: b.unsignedRounds + b.unansweredSurveys > 0, href: `${reportsHref}?tab=cases` },
    { label: '지급서류 미비 멘토', value: b.mentorsMissingDocs, on: b.mentorsMissingDocs > 0, href: base === '/nextlab' ? '/nextlab/roster?tab=mentor-match' : `${reportsHref}?tab=cases&view=mentor` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <KpiBand title={`핵심 지표 · ${scopeLabel}`}>
        <Kpi label="멘티 케이스" value={p.cases} sub={`진행 ${active} · 종결 ${p.closed} · 중도 ${p.byStatus.withdrawn}`} />
        <Ring value={pct(assigned, active)} label={`멘토 배정률 (${assigned}/${active})`} />
        <Ring value={pct(p.roundsDone, p.roundsPlanned)} label={`회차 이행률 (${p.roundsDone}/${p.roundsPlanned})`} color="#60A5FA" />
        <Ring value={Math.round(p.closureRate * 100)} label={`종결률 (${p.closed}/${p.cases})`} color="#A78BFA" />
        {/* 운영사 멘토 평가는 내부 지표 — 발주처 화면에는 노출하지 않는다 (P31) */}
        <Kpi label="만족도 평균" value={e.surveyAvg ?? '-'} sub={base === '/institution' ? `응답 ${e.surveyResponses}건` : `응답 ${e.surveyResponses}건 · 운영사 평가 ${e.mentorReviewAvg ?? '-'}`} />
        <Kpi wide label="완료 회차(정산 확정)" value={p.roundsCompleted} sub={`온 ${p.onlineRounds} · 오프 ${p.offlineRounds} · 관찰의견서 ${Math.round(e.observationRate * 100)}%`} />
      </KpiBand>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-bold">점검 항목</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {checks.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className={cn('flex flex-col gap-0.5 rounded-xl border-2 border-l-[6px] p-3 text-sm transition-colors hover:border-primary', c.on ? 'border-amber-300 border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20' : 'border-l-emerald-400 bg-background')}
            >
              <span className="text-[11px] font-medium text-muted-foreground">{c.label}</span>
              <span className={cn('text-xl font-extrabold tabular-nums', c.on ? 'text-amber-800 dark:text-amber-300' : 'text-foreground')}>{c.value}</span>
              {c.sub && <span className="text-[11px] text-muted-foreground">{c.sub}</span>}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="진행 단계 분포" sub="케이스가 어느 단계에 몰려 있는지 — 붉은 막대는 조치가 필요한 단계">
          <StatusBars m={m} />
        </Panel>
        <Panel title="라운드(그룹)별 진행" sub="케이스 · 배정 · 미배정 · 종결과 회차 이행률">
          <GroupProgress m={m} />
        </Panel>
        <Panel title="정산 파이프라인" sub={`예상 → 지급 대기 → 품의 → 정산 확인 → 지급 완료 · 지급 완료 합계 ${formatKRW(s.paidNet)}`}>
          <SettlementPipeline m={m} />
        </Panel>
        <Panel title="월별 이행 회차 (최근 12개월)" sub="보고서까지 등록된 회차 기준 — 자세한 추이는 [월별 추이] 탭">
          {trend ? <MonthlyBars months={trend} /> : <p className="py-6 text-center text-xs text-muted-foreground">추이 데이터가 없습니다.</p>}
        </Panel>
      </div>
    </div>
  );
}
