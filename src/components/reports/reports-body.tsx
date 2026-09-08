import Link from 'next/link';
import { Download } from 'lucide-react';

import type { ProgramMetrics } from '@/lib/reports/metrics';
import type { CaseListItem } from '@/lib/data/cases';
import type { SettlementItem } from '@/lib/data/settlements';
import { CASE_STATUSES, CASE_STATUS_META } from '@/types/case-status';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';
import { MetricsTiles } from '@/components/reports/metrics-tiles';
import { SettlementsTable } from '@/components/settlement/settlements-table';
import { CaseTable } from '@/components/cases/case-table';
import type { Branding } from '@/lib/programs/branding';
import { formatKRW } from '@/lib/utils/format';

export const REPORT_TABS = [
  { key: 'overview', label: '개요' },
  { key: 'cases', label: '진행현황' },
  { key: 'mentors', label: '멘토 실적' },
  { key: 'groups', label: '그룹 실적' },
  { key: 'settlement', label: '정산' },
  { key: 'survey', label: '만족도' },
  { key: 'backlog', label: '잔여 과업' },
] as const;
export type ReportTab = (typeof REPORT_TABS)[number]['key'];

/** 리포트 본문 (docs §19-2) — 운영사·발주처 공용 */
export function ReportsBody({ m, tab, base, cases, settlements, branding, exportHref }: { m: ProgramMetrics; tab: ReportTab; base: '/nextlab' | '/institution'; cases: CaseListItem[]; settlements: SettlementItem[]; branding: Branding; exportHref: string }) {
  const reportsHref = `${base}/reports`;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap gap-1.5">
          {REPORT_TABS.map((t) => (
            <Link key={t.key} href={`${reportsHref}?tab=${t.key}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
              {t.label}
            </Link>
          ))}
        </nav>
        {base === '/nextlab' && (
          <Link href={`${reportsHref}/summary`} className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-200">
            종합결과리포트 →
          </Link>
        )}
        <a href={`${exportHref}?tab=${tab}`} className="inline-flex items-center gap-1 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent">
          <Download className="h-4 w-4" /> 엑셀 내보내기
        </a>
      </div>

      {tab === 'overview' && <MetricsTiles m={m} base={base} reportsHref={reportsHref} />}

      {tab === 'cases' && (
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
          <CaseTable items={cases} basePath={`${base}/cases`} branding={branding} showGroup />
        </div>
      )}

      {tab === 'mentors' && (
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
                  <td className="px-3 py-2 font-medium">{x.name}</td>
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
      )}

      {tab === 'groups' && (
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">그룹</th><th className="px-3 py-2">상태</th><th className="px-3 py-2 text-right">케이스</th><th className="px-3 py-2 text-right">회차(이행/계획)</th><th className="px-3 py-2 text-right">종결</th><th className="px-3 py-2 text-right">승계 유입/유출</th><th className="px-3 py-2 text-right">만족도</th><th className="px-3 py-2 text-right">확정 실지급</th>
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

      {tab === 'backlog' && (
        <div className="flex flex-col gap-3">
          <MetricsTiles m={m} base={base} reportsHref={reportsHref} />
          <CaseTable items={cases.filter((c) => !['closed', 'withdrawn'].includes(c.status) && c.roundsDone < c.requiredRounds)} basePath={`${base}/cases`} branding={branding} showGroup emptyText="잔여 회차가 있는 케이스가 없습니다." />
        </div>
      )}
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
