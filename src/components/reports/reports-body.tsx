import Link from 'next/link';
import { AlertTriangle, ClipboardList, Coins, LayoutDashboard, Layers, Smile, TrendingUp, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { ExcelButton } from '@/components/common/excel-button';

import { periodLabel, type ProgramMetrics, type ReportPeriod } from '@/lib/reports/metrics';
import { CaseFilters } from '@/components/cases/case-filters';
import type { BudgetOverview } from '@/lib/reports/budget';
import { BudgetCard } from '@/components/reports/budget-card';
import type { DelayedCase } from '@/lib/reports/delays';
import { DelayList } from '@/components/reports/delay-list';
import type { TrendMonth } from '@/lib/reports/trend';
import { TrendCharts } from '@/components/reports/trend-charts';
import type { CaseListItem } from '@/lib/data/cases';
import type { SettlementItem } from '@/lib/data/settlements';
import { CASE_STATUSES, CASE_STATUS_META } from '@/types/case-status';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';
import { MetricsTiles } from '@/components/reports/metrics-tiles';
import { SettlementsTable } from '@/components/settlement/settlements-table';
import { CaseTable } from '@/components/cases/case-table';
import { MentorProgressTable } from '@/components/nextlab/matching-lists';
import type { MentorMatchRow } from '@/lib/data/matching-lists';
import { SubTabs } from '@/components/common/sub-tabs';
import { MentorName } from '@/components/common/mentor-name';
import type { Branding } from '@/lib/programs/branding';
import { formatKRW } from '@/lib/utils/format';

/** 리포트 탭 (P26-03: 잔여 과업 탭 제거 — 지연 케이스는 개요로, 잔여 회차 표는 진행현황과 중복) */
export const REPORT_TABS = [
  { key: 'overview', label: '개요', icon: LayoutDashboard },
  { key: 'trend', label: '월별 추이', icon: TrendingUp },
  { key: 'cases', label: '진행현황', icon: ClipboardList },
  { key: 'mentors', label: '멘토 실적', icon: Users },
  { key: 'groups', label: '그룹 실적', icon: Layers },
  { key: 'settlement', label: '정산', icon: Coins },
  { key: 'survey', label: '만족도', icon: Smile },
] as const satisfies readonly { key: string; label: string; icon: LucideIcon }[];
export type ReportTab = (typeof REPORT_TABS)[number]['key'];

/** 리포트 본문 (docs §19-2) — 운영사·발주처 공용.
 *  groupFilter = 라운드(사업그룹)별 구분 탭 (P20), casesView = 진행현황 탭의 멘티/멘토 세로 메뉴. */
export function ReportsBody({
  m,
  tab,
  base,
  cases,
  settlements,
  branding,
  exportHref,
  groupFilter,
  casesView = 'mentee',
  mentorProgress,
  budget,
  delays,
  lastNudges,
  trend,
  period = null,
  periodPresets = [],
  trendYear = null,
  caseFilterMentors,
  totalCases,
}: {
  m: ProgramMetrics;
  tab: ReportTab;
  base: '/nextlab' | '/institution';
  cases: CaseListItem[];
  /** 필터 전 케이스 수 (진행현황 캡션) */
  totalCases?: number;
  settlements: SettlementItem[];
  branding: Branding;
  exportHref: string;
  groupFilter?: { current: string | null; options: { id: string; name: string }[] };
  casesView?: 'mentee' | 'mentor';
  /** 멘토 진행현황 — 그룹별(담당 인원)·담당 멘티명·회차·확정 실지급·만족도·운영사 평가 (P27-17). 발주처는 운영사 평가 열 없음 */
  mentorProgress?: MentorMatchRow[];
  /** 예산 집행 게이지 (개요 탭, P22) */
  budget?: BudgetOverview;
  /** 지연 케이스 목록 (개요 탭, P22·P26-03) */
  delays?: DelayedCase[];
  lastNudges?: Record<string, string>;
  /** 월별 추이 (월별 추이 탭, P22) */
  trend?: TrendMonth[];
  /** 기간 필터 (P30) — 칩은 페이지가 KST 로 계산해 내려준다 */
  period?: ReportPeriod | null;
  periodPresets?: { key: string; label: string; from: string | null; to: string | null }[];
  /** 월별 추이 연도 (null = 최근 12개월) */
  trendYear?: number | null;
  /** 진행현황 탭 필터의 멘토 선택지 (있으면 CaseFilters 를 그린다) */
  caseFilterMentors?: { id: string; name: string }[];
}) {
  const reportsHref = `${base}/reports`;
  const periodQs = period?.from || period?.to ? `${period.from ? `&from=${period.from}` : ''}${period.to ? `&to=${period.to}` : ''}` : '';
  const groupQs = `${groupFilter?.current ? `&group=${groupFilter.current}` : ''}${periodQs}`;
  const hasPeriod = !!(period && (period.from || period.to));
  const thisYear = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
  return (
    <div className="flex flex-col gap-5">
      {/* 라운드(그룹) 칩은 상단 [범위] 스위처로 통합 (P28) — groupFilter 는 링크 쿼리 유지용 */}
      {/* 탭 메뉴 (P26-02 · P27-18): 짙은 청색 바, 활성 탭은 흰 박스 + 코랄 아이콘/글자 */}
      <div className="flex flex-wrap items-center gap-2">
        <SubTabs ariaLabel="리포트 탭" active={tab} className="flex-1" items={REPORT_TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon, href: `${reportsHref}?tab=${t.key}${groupQs}` }))} />
        <div className="flex items-center gap-2">
          {base === '/nextlab' && (
            <Link href={`${reportsHref}/summary`} className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-lg border border-violet-300 bg-violet-50 px-3 text-xs font-bold text-violet-800 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200">
              종합결과리포트 →
            </Link>
          )}
          <ExcelButton href={`${exportHref}${exportHref.includes('?') ? '&' : '?'}tab=${tab}${periodQs}${trendYear ? `&year=${trendYear}` : ''}${casesView === 'mentor' ? '&view=mentor' : ''}`} />
        </div>
      </div>

      {/* 기간 칩 (P30) — 회차 = 보고서 등록일 · 정산 = 확정일 · 케이스 신규/종결 = 등록일/종결일 */}
      {periodPresets.length > 0 && tab !== 'trend' && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-muted-foreground">기간</span>
          {periodPresets.map((pp) => {
            const active = (pp.from ?? null) === (period?.from ?? null) && (pp.to ?? null) === (period?.to ?? null);
            const qs = `${reportsHref}?tab=${tab}${groupFilter?.current ? `&group=${groupFilter.current}` : ''}${casesView === 'mentor' ? '&view=mentor' : ''}${pp.from ? `&from=${pp.from}` : ''}${pp.to ? `&to=${pp.to}` : ''}`;
            return (
              <Link key={pp.key} href={qs} className={`rounded-full px-3 py-1 font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
                {pp.label}
              </Link>
            );
          })}
          <span className="text-muted-foreground">{hasPeriod ? `${periodLabel(period)} — 이행 회차 ${m.performance.roundsDone} · 신규 ${m.performance.newCases} · 종결 ${m.performance.closedCases}` : '전체 기간'}</span>
        </div>
      )}
      {tab === 'trend' && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-muted-foreground">기준</span>
          <Link href={`${reportsHref}?tab=trend${groupFilter?.current ? `&group=${groupFilter.current}` : ''}`} className={`rounded-full px-3 py-1 font-semibold ${!trendYear ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>최근 12개월</Link>
          {[thisYear, thisYear - 1].map((y) => (
            <Link key={y} href={`${reportsHref}?tab=trend${groupFilter?.current ? `&group=${groupFilter.current}` : ''}&year=${y}`} className={`rounded-full px-3 py-1 font-semibold ${trendYear === y ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>{y}년</Link>
          ))}
        </div>
      )}

      {tab === 'overview' && (
        <div className="flex flex-col gap-4">
          {budget && <BudgetCard overview={budget} settingsHint={base === '/nextlab'} />}
          <MetricsTiles m={m} base={base} reportsHref={reportsHref} />
          {delays && (
            <section id="delays" className={`scroll-mt-40 flex flex-col gap-2 rounded-xl border p-4 ${delays.length > 0 ? 'border-status-rejected/40 bg-status-rejected/5' : 'bg-background'}`}>
              <h3 className="flex items-center gap-2 text-base font-bold">
                <AlertTriangle className={`h-5 w-5 ${delays.length > 0 ? 'text-status-rejected' : 'text-muted-foreground'}`} /> 지연 케이스 {delays.length}건
              </h3>
              <DelayList items={delays} caseHrefBase={`${base}/cases`} canNudge={base === '/nextlab'} lastNudges={lastNudges} />
            </section>
          )}
        </div>
      )}

      {tab === 'trend' && trend && <TrendCharts months={trend} />}

      {tab === 'cases' && (
        <div className="grid gap-4 lg:grid-cols-[170px_1fr]">
          {/* 좌측 세로 메뉴 — 멘티 진행현황 / 멘토 진행현황 (P20) */}
          <nav className="flex h-fit flex-row gap-1 overflow-x-auto rounded-xl border bg-background p-2 lg:flex-col">
            <Link
              href={`${reportsHref}?tab=cases${groupQs}`}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${casesView === 'mentee' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >
              멘티 진행현황
            </Link>
            <Link
              href={`${reportsHref}?tab=cases&view=mentor${groupQs}`}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${casesView === 'mentor' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >
              멘토 진행현황
            </Link>
          </nav>
          {casesView === 'mentee' ? (
            <div className="flex flex-col gap-4">
              <div className="overflow-x-auto rounded-xl border bg-background">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                      <th className="px-2 py-2">그룹</th>
                      {CASE_STATUSES.map((s) => (
                        <th key={s} className="px-2 py-2 text-right">{CASE_STATUS_META[s].short}</th>
                      ))}
                      <th className="px-2 py-2 text-right">합계</th>
                      <th className="px-2 py-2 text-right">회차</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.groups.map((g) => (
                      <tr key={g.id} className="border-b last:border-0">
                        <td className="px-2 py-1 font-medium">{g.name}</td>
                        {CASE_STATUSES.map((s) => (
                          <td key={s} className="px-2 py-1 text-right tabular-nums">{g.byStatus[s] || ''}</td>
                        ))}
                        <td className="px-2 py-1 text-right font-semibold tabular-nums">{g.cases}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{g.roundsDone}/{g.roundsPlanned}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {caseFilterMentors && <CaseFilters mentors={caseFilterMentors} />}
              <CaseTable items={cases} basePath={`${base}/cases`} branding={branding} showGroup showLegend caption={totalCases !== undefined && totalCases !== cases.length ? `필터 결과 ${cases.length}건 / 전체 ${totalCases}건` : undefined} />
            </div>
          ) : mentorProgress ? (
            <MentorProgressTable rows={mentorProgress} caseHrefBase={`${base}/cases`} showReview={base === '/nextlab'} />
          ) : (
            <MentorsTable m={m} base={base} />
          )}
        </div>
      )}

      {tab === 'mentors' && <MentorsTable m={m} base={base} />}

      {tab === 'groups' && (
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">그룹</th><th className="px-3 py-2">상태</th><th className="px-3 py-2 text-right">케이스</th><th className="px-3 py-2 text-right">회차(이행/계획)</th><th className="px-3 py-2 text-right">종결</th><th className="px-3 py-2 text-right">승계 유입/유출</th><th className="px-3 py-2 text-right" title="이전 케이스가 중도 종료(탈락)였던 재배치">재배치 유입/유출</th><th className="px-3 py-2 text-right">만족도</th><th className="px-3 py-2 text-right">확정 실지급</th>
              </tr>
            </thead>
            <tbody>
              {m.groups.map((g) => (
                <tr key={g.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{g.code} · {g.name}</td>
                  <td className="px-3 py-2 text-xs">{g.status === 'active' ? '진행 중' : '종료'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.cases}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.roundsDone}/{g.roundsPlanned}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.closed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.succeededFrom}/{g.succeededTo}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.relocatedFrom ?? 0}/{g.relocatedTo ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.surveyAvg ?? '-'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKRW(g.settledNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'settlement' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {m.settlement.byMethod.map((x) => (
              <div key={x.method} className="rounded-xl border bg-background p-3">
                <div className="text-xs text-muted-foreground">{WITHHOLDING_LABELS[x.method as keyof typeof WITHHOLDING_LABELS] ?? x.method}</div>
                <div className="font-bold tabular-nums">{formatKRW(x.net)}</div>
                <div className="text-[11px] text-muted-foreground">{x.count}건</div>
              </div>
            ))}
            <div className="rounded-xl border bg-background p-3">
              <div className="text-xs text-muted-foreground">원천징수 합계 (세무 제출)</div>
              <div className="font-bold tabular-nums">{formatKRW(m.settlement.withholdingTotal)}</div>
            </div>
          </div>
          <SettlementsTable items={settlements} caseHrefBase={`${base}/cases`} batchHrefBase={base === '/nextlab' ? '/nextlab/settlements/batches' : '/institution/settlements'} />
        </div>
      )}

      {tab === 'survey' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-background p-4">
            <h3 className="text-sm font-semibold">그룹별 만족도</h3>
            <Bars rows={m.evaluation.surveyByGroup} />
          </div>
          <div className="rounded-xl border bg-background p-4">
            <h3 className="text-sm font-semibold">멘토별 만족도</h3>
            <Bars rows={m.evaluation.surveyByMentor} />
          </div>
        </div>
      )}

    </div>
  );
}

/** 멘토별 진행현황 표 — [멘토 실적] 탭과 진행현황 탭의 [멘토 진행현황] 공용 */
function MentorsTable({ m, base }: { m: ProgramMetrics; base: '/nextlab' | '/institution' }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2">멘토</th><th className="px-3 py-2 text-right">담당(활성)</th><th className="px-3 py-2 text-right">이행</th><th className="px-3 py-2 text-right">완료</th><th className="px-3 py-2 text-right">온/오프</th><th className="px-3 py-2 text-right">종결</th><th className="px-3 py-2 text-right">확정 실지급</th><th className="px-3 py-2 text-right">만족도</th><th className="px-3 py-2 text-right">운영사 평가</th>
          </tr>
        </thead>
        <tbody>
          {m.mentors.map((x) => (
            <tr key={x.id} className="border-b last:border-0">
              <td className="px-3 py-2 font-medium"><MentorName id={x.id} name={x.name} count={x.activeCases} caseHrefBase={`${base}/cases`} /></td>
              <td className="px-3 py-2 text-right tabular-nums">{x.cases} ({x.activeCases})</td>
              <td className="px-3 py-2 text-right tabular-nums">{x.roundsDone}</td>
              <td className="px-3 py-2 text-right tabular-nums">{x.roundsCompleted}</td>
              <td className="px-3 py-2 text-right tabular-nums">{x.online}/{x.offline}</td>
              <td className="px-3 py-2 text-right tabular-nums">{x.closed}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatKRW(x.settledNet)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{x.surveyAvg ?? '-'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{base === '/nextlab' ? (x.reviewAvg ?? '-') : '·'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bars({ rows }: { rows: { id: string; name: string; avg: number | null; n: number }[] }) {
  if (rows.length === 0) return <p className="mt-2 text-xs text-muted-foreground">응답이 없습니다.</p>;
  return (
    <ul className="mt-2 flex flex-col gap-1 text-xs">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-2">
          <span className="w-28 truncate">{r.name}</span>
          <span className="h-3 flex-1 overflow-hidden rounded bg-muted">
            <span className="block h-full bg-primary" style={{ width: `${((r.avg ?? 0) / 5) * 100}%` }} />
          </span>
          <span className="w-16 text-right tabular-nums">{r.avg ?? '-'} ({r.n})</span>
        </li>
      ))}
    </ul>
  );
}
