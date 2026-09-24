import Link from 'next/link';
import { Clock, FolderOpen, Landmark, Layers } from 'lucide-react';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { fmt } from '@/lib/programs/branding';
import { listBatches, listSettlements } from '@/lib/data/settlements';
import { computeSettlementKpi } from '@/lib/settlement/kpi';
import { computeTaxSummary } from '@/lib/settlement/tax';
import { SettlementsTable } from '@/components/settlement/settlements-table';
import { SettlementFlowStrip } from '@/components/settlement/settlement-flow-strip';
import { StatusBadge } from '@/components/cases/status-badge';
import { SubTabs } from '@/components/common/sub-tabs';
import { EmptyState } from '@/components/common/empty-state';
import { ExcelButton } from '@/components/common/excel-button';
import { formatDate, formatKRW } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

type Tab = 'pending' | 'all' | 'tax';

/** 운영사 정산 — 지급 대기 건 편성(T8) + 품의 목록 + (P31) KPI 행 · 원천세 탭(지급일 기준) */
export default async function Page({ searchParams }: { searchParams: { tab?: string; year?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const tab: Tab = searchParams.tab === 'all' ? 'all' : searchParams.tab === 'tax' ? 'tax' : 'pending';
  const groupId = ctx.supportTypeId ?? undefined;
  const kpi = await computeSettlementKpi(ctx.programId, groupId ?? null);

  const kpiRow = (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-xl border-2 bg-background p-3">
        <p className="text-xs text-muted-foreground">지급 예정 합계 (제출·확인 완료, 미지급)</p>
        <p className="text-lg font-bold tabular-nums">{formatKRW(kpi.scheduledNet)}</p>
        <p className="text-[11px] text-muted-foreground">품의 {kpi.scheduledBatches}건 · 실지급 기준</p>
      </div>
      <div className={`rounded-xl border-2 bg-background p-3 ${kpi.waitingBatches.some((b) => b.days >= 7) ? 'border-amber-400' : ''}`}>
        <p className="text-xs text-muted-foreground">{fmt('{client} 확인 대기 품의', ctx.branding)}</p>
        <p className="text-lg font-bold tabular-nums">{kpi.waitingBatches.length}건{kpi.waitingBatches[0] ? ` · 최장 ${kpi.waitingBatches[0].days}일` : ''}</p>
        <p className="truncate text-[11px] text-muted-foreground">{kpi.waitingBatches.slice(0, 2).map((b) => `${b.title} (${b.days}일)`).join(' · ') || '대기 중인 품의 없음'}</p>
      </div>
      <div className="rounded-xl border-2 bg-background p-3">
        <p className="text-xs text-muted-foreground">멘토별 미지급 누계 (확정~지급 전)</p>
        <p className="text-lg font-bold tabular-nums">{formatKRW(kpi.unpaidTotalNet)}</p>
        <p className="truncate text-[11px] text-muted-foreground">{kpi.unpaidByMentor.slice(0, 3).map((m) => `${m.mentorName} ${formatKRW(m.net)}`).join(' · ') || '미지급 정산 없음'}</p>
      </div>
    </div>
  );

  if (tab === 'tax') {
    const year = searchParams.year && /^\d{4}$/.test(searchParams.year) ? Number(searchParams.year) : null;
    const t = await computeTaxSummary(ctx.programId, groupId ?? null, year);
    const sum = (k: 'count' | 'gross' | 'incomeTax' | 'localTax' | 'withholding' | 'net') => t.months.reduce((a, m) => a + m[k], 0);
    return (
      <main className="flex flex-col gap-6">
        <Header ctx={{ groupName: ctx.group?.name ?? null }} />
        {kpiRow}
        <Tabs tab={tab} pendingN={null} />
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">원천세 집계 <span className="text-sm font-normal text-muted-foreground">— 지급일(paid_at) 기준 귀속</span></h2>
              <p className="text-xs text-muted-foreground">지급 완료된 정산만 집계합니다. 확정됐지만 미지급인 건은 포함되지 않습니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <nav className="flex flex-wrap gap-1 text-xs">
                <Link href="/nextlab/settlements?tab=tax" className={`rounded-full px-2.5 py-1 font-semibold ${!year ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>전체</Link>
                {t.years.map((y) => (
                  <Link key={y} href={`/nextlab/settlements?tab=tax&year=${y}`} className={`rounded-full px-2.5 py-1 font-semibold ${year === Number(y) ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>{y}년</Link>
                ))}
              </nav>
              <ExcelButton href={`/api/nextlab/tax-export${year ? `?year=${year}` : ''}`} label="원천세 엑셀" />
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">귀속연월</th>
                  <th className="px-3 py-2">방식</th>
                  <th className="px-3 py-2 text-right">인원</th>
                  <th className="hidden px-3 py-2 text-right md:table-cell">건수</th>
                  <th className="px-3 py-2 text-right">총지급(세전)</th>
                  <th className="px-3 py-2 text-right">소득세</th>
                  <th className="px-3 py-2 text-right">지방소득세</th>
                  <th className="hidden px-3 py-2 text-right md:table-cell">실지급</th>
                </tr>
              </thead>
              <tbody>
                {t.months.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">지급 완료된 정산이 없습니다.</td></tr>
                )}
                {t.months.map((m) => (
                  <tr key={`${m.month}|${m.method}`} className="border-b last:border-0">
                    <td className="px-3 py-2 tabular-nums">{m.month}</td>
                    <td className="px-3 py-2 text-xs">{m.methodLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.mentors}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{m.count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKRW(m.gross)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKRW(m.incomeTax)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKRW(m.localTax)}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatKRW(m.net)}</td>
                  </tr>
                ))}
                {t.months.length > 0 && (
                  <tr className="bg-muted/30 font-semibold">
                    <td className="px-3 py-2" colSpan={3}>합계</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{sum('count')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKRW(sum('gross'))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKRW(sum('incomeTax'))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKRW(sum('localTax'))}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatKRW(sum('net'))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <h3 className="mt-2 text-base font-semibold">연간 멘토별 지급 총액</h3>
          <div className="overflow-x-auto rounded-xl border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">연도</th>
                  <th className="px-3 py-2">멘토</th>
                  <th className="px-3 py-2">방식</th>
                  <th className="px-3 py-2 text-right">건수</th>
                  <th className="px-3 py-2 text-right">총지급(세전)</th>
                  <th className="hidden px-3 py-2 text-right md:table-cell">소득세</th>
                  <th className="hidden px-3 py-2 text-right md:table-cell">지방소득세</th>
                  <th className="px-3 py-2 text-right">실지급</th>
                </tr>
              </thead>
              <tbody>
                {t.mentors.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">지급 완료된 정산이 없습니다.</td></tr>
                )}
                {t.mentors.map((m) => (
                  <tr key={`${m.year}|${m.mentorId}|${m.method}`} className="border-b last:border-0">
                    <td className="px-3 py-2 tabular-nums">{m.year}</td>
                    <td className="px-3 py-2 font-medium">{m.mentorName}</td>
                    <td className="px-3 py-2 text-xs">{m.methodLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKRW(m.gross)}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatKRW(m.incomeTax)}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatKRW(m.localTax)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKRW(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    );
  }

  const [settlements, batches, pendingCount, scopedBatched] = await Promise.all([
    listSettlements({ programId: ctx.programId, supportTypeId: groupId, status: tab === 'pending' ? ['pending'] : undefined }),
    listBatches(ctx.programId),
    tab === 'pending' ? Promise.resolve(null) : listSettlements({ programId: ctx.programId, supportTypeId: groupId, status: ['pending'] }).then((r) => r.length),
    // 그룹 범위면 그 그룹의 정산 건이 든 품의만 보여준다 (품의 자체는 행사 단위)
    groupId ? listSettlements({ programId: ctx.programId, supportTypeId: groupId, status: ['batched', 'confirmed', 'paid'] }) : Promise.resolve(null),
  ]);
  const pendingN = tab === 'pending' ? settlements.length : (pendingCount ?? 0);
  const batchIdsInScope = scopedBatched ? new Set(scopedBatched.map((s) => s.batch_id).filter((x): x is string => !!x)) : null;
  const visibleBatches = batchIdsInScope ? batches.filter((b) => batchIdsInScope.has(b.id)) : batches;
  const drafts = batches.filter((b) => b.status === 'draft');
  const submitted = batches.filter((b) => b.status === 'submitted');
  const tabQuery = `?tab=${tab}`;

  return (
    <main className="flex flex-col gap-6">
      <Header ctx={{ groupName: ctx.group?.name ?? null }} />

      <SettlementFlowStrip current={drafts.length > 0 ? 3 : 2} />
      {kpiRow}
      {submitted.length > 0 && (
        <p className="rounded-lg border border-sky-300 bg-sky-50/60 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950/20 dark:text-sky-100">
          {fmt('{client} 정산 확인을 기다리는 품의', ctx.branding)} {submitted.length}건이 있습니다. 확인이 끝나면 품의 상세에서 [지급 완료]를 눌러 지급을 기록하세요.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">정산 건</h2>
          <Tabs tab={tab} pendingN={pendingN} />
        </div>
        <SettlementsTable
          exportHref="/api/nextlab/settlements-export"
          items={settlements}
          selectable={tab === 'pending'}
          draftBatches={drafts.map((b) => ({ id: b.id, title: b.title }))}
          caseHrefBase="/nextlab/cases"
          batchHrefBase="/nextlab/settlements/batches"
          batchQuery={tabQuery}
          emptyHint={tab === 'pending' ? '지급 대기 건이 없습니다. 케이스 상세에서 종결 검수를 승인하면 정산이 확정되어 여기에 나타납니다.' : '아직 확정된 정산 건이 없습니다.'}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-semibold">지급 품의</h2>
          {batchIdsInScope && <span className="text-xs text-muted-foreground">{ctx.group?.name} 정산 건이 포함된 품의만 표시 · 행사 전체 품의는 범위를 [행사 전체]로</span>}
        </div>
        {visibleBatches.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="아직 품의가 없습니다"
            hint={batchIdsInScope ? '이 그룹의 정산 건이 편성된 품의가 없습니다. 위 목록에서 지급 대기 건을 체크해 [품의 편성]을 누르세요.' : '지급 대기 건이 생기면(케이스 상세에서 검수 승인) 위 목록에서 체크해 [품의 편성]을 누르세요.'}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">제목</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2 text-right">건수</th>
                  <th className="hidden px-3 py-2 text-right md:table-cell">지급총액</th>
                  <th className="px-3 py-2 text-right">실지급</th>
                  <th className="hidden px-3 py-2 md:table-cell">제출</th>
                  <th className="hidden px-3 py-2 md:table-cell">정산 확인</th>
                  <th className="hidden px-3 py-2 md:table-cell">지급</th>
                </tr>
              </thead>
              <tbody>
                {visibleBatches.map((b) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/nextlab/settlements/batches/${b.id}${tabQuery}`} className="hover:underline">
                        {b.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs"><StatusBadge kind="batch" status={b.status} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.itemCount}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatKRW(Number(b.total_gross))}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKRW(Number(b.total_net))}</td>
                    <td className="hidden px-3 py-2 text-xs tabular-nums md:table-cell">{formatDate(b.submitted_at)}</td>
                    <td className="hidden px-3 py-2 text-xs tabular-nums md:table-cell">{formatDate(b.confirmed_at)}</td>
                    <td className="hidden px-3 py-2 text-xs tabular-nums md:table-cell">{formatDate(b.paid_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Header({ ctx }: { ctx: { groupName: string | null } }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">정산 · 지급 품의</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        검수 승인(종결)·중도 종료 시 확정된 정산 건을 골라 지급 품의를 편성하고 발주처에 제출합니다. {ctx.groupName ? `(${ctx.groupName})` : ''}
      </p>
    </div>
  );
}

function Tabs({ tab, pendingN }: { tab: Tab; pendingN: number | null }) {
  return (
    <SubTabs
      ariaLabel="정산 건 보기"
      active={tab}
      items={[
        { key: 'pending', label: '지급 대기', href: '/nextlab/settlements?tab=pending', icon: Clock, count: pendingN ?? undefined },
        { key: 'all', label: '전체', href: '/nextlab/settlements?tab=all', icon: Layers },
        { key: 'tax', label: '원천세', href: '/nextlab/settlements?tab=tax', icon: Landmark },
      ]}
    />
  );
}
