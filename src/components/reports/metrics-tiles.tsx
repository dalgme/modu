import Link from 'next/link';

import type { ProgramMetrics } from '@/lib/reports/metrics';
import { formatKRW } from '@/lib/utils/format';

function Tile({ label, value, sub, href, tone = 'default' }: { label: string; value: string | number; sub?: string; href?: string; tone?: 'default' | 'warn' | 'good' }) {
  const cls = `flex flex-col gap-0.5 rounded-xl border p-3 text-sm shadow-sm ${tone === 'warn' ? 'border-amber-300 bg-amber-50/50' : tone === 'good' ? 'border-emerald-300 bg-emerald-50/40' : 'bg-background'}`;
  const inner = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-bold tabular-nums">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </>
  );
  return href ? (
    <Link href={href} className={`${cls} hover:bg-accent/40`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** 대시보드 통계 타일 (docs §19-1) — 운영사·발주처 공용, 링크 base 만 다름 */
export function MetricsTiles({ m, base, reportsHref }: { m: ProgramMetrics; base: '/nextlab' | '/institution'; reportsHref: string }) {
  const p = m.performance;
  const b = m.backlog;
  const e = m.evaluation;
  const s = m.settlement;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">수행 성과</h2>
        <Link href={reportsHref} className="text-xs text-primary hover:underline">리포트 전체 →</Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label="케이스" value={p.cases} sub={`종결 ${p.closed} · 중도 ${p.byStatus.withdrawn}`} href={`${reportsHref}?tab=cases`} />
        <Tile label="이행 회차 / 계획" value={`${p.roundsDone} / ${p.roundsPlanned}`} sub={p.roundsPlanned ? pct(p.roundsDone / p.roundsPlanned) : '-'} href={`${reportsHref}?tab=cases`} />
        <Tile label="완료 회차(정산 확정)" value={p.roundsCompleted} sub={`온 ${p.onlineRounds} · 오프 ${p.offlineRounds}`} />
        <Tile label="종결률" value={pct(p.closureRate)} sub={`관찰의견서 제출률 ${pct(e.observationRate)}`} tone={p.closureRate >= 0.5 ? 'good' : 'default'} />
        <Tile label="만족도 평균" value={e.surveyAvg ?? '-'} sub={`응답 ${e.surveyResponses}건 · 운영사 평가 ${e.mentorReviewAvg ?? '-'}`} href={`${reportsHref}?tab=survey`} />
      </div>
      <h2 className="text-base font-semibold">비수행 잔여 과업</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label="미배정" value={b.unassigned} tone={b.unassigned ? 'warn' : 'default'} href={`${base}/dashboard`} />
        <Tile label="잔여 회차" value={b.remainingRounds} sub={`정체(${b.stalledDays}일 무회차) ${b.stalled}건`} tone={b.stalled ? 'warn' : 'default'} href={`${reportsHref}?tab=backlog`} />
        <Tile label="검수 대기 / 보완 중" value={`${b.reviewPending} / ${b.revisionRequested}`} tone={b.reviewPending ? 'warn' : 'default'} href={`${base}/dashboard`} />
        <Tile label="재배정 대기" value={b.reassignmentPending} sub={`미처리 요청 ${b.pendingRequests}건`} tone={b.reassignmentPending || b.pendingRequests ? 'warn' : 'default'} href={base === '/nextlab' ? '/nextlab/requests' : `${reportsHref}?tab=backlog`} />
        <Tile label="미서명 회차 / 미응답 설문" value={`${b.unsignedRounds} / ${b.unansweredSurveys}`} sub={`지급서류 미비 멘토 ${b.mentorsMissingDocs}명`} href={`${reportsHref}?tab=backlog`} />
      </div>
      <h2 className="text-base font-semibold">정산</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label="예상(미확정, 세전)" value={formatKRW(s.estimatedGross)} href={`${reportsHref}?tab=settlement`} />
        <Tile label="확정 · 지급 대기" value={formatKRW(s.pendingNet)} tone={s.pendingNet ? 'warn' : 'default'} href={`${base}/settlements`} />
        <Tile label="품의 편성" value={formatKRW(s.batchedNet)} href={`${base}/settlements`} />
        <Tile label="정산 확인 완료" value={formatKRW(s.confirmedNet)} href={`${base}/settlements`} />
        <Tile label="지급 완료" value={formatKRW(s.paidNet)} sub={`원천징수 합계 ${formatKRW(s.withholdingTotal)}`} tone={s.paidNet ? 'good' : 'default'} />
      </div>
    </div>
  );
}
