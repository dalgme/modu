import Link from 'next/link';
import { FolderOpen, Landmark } from 'lucide-react';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { fmt } from '@/lib/programs/branding';
import { listBatches, listSettlements } from '@/lib/data/settlements';
import { computeSettlementKpi } from '@/lib/settlement/kpi';
import { computeTaxSummary } from '@/lib/settlement/tax';
import { SettlementFlowStrip } from '@/components/settlement/settlement-flow-strip';
import { StatusBadge } from '@/components/cases/status-badge';
import { SubTabs } from '@/components/common/sub-tabs';
import { EmptyState } from '@/components/common/empty-state';
import { ExcelButton } from '@/components/common/excel-button';
import { MentoringExportBar } from '@/components/reports/mentoring-export-bar';
import { PriorMentorBacklog } from '@/components/settlement/prior-mentor-backlog';
import { BatchRowConfirmButton, BatchRowPaidButton, BulkConfirmBatchesButton } from '@/components/settlement/batch-actions';
import { PendingBatchBanner } from '@/components/settlement/pending-batch-banner';
import { OpenProgressPanel } from '@/components/settlement/open-progress-panel';
import { listUnbatchedPending, loadBatchListExtras, loadOpenProgress } from '@/lib/settlement/settlement-board';
import { hoursText } from '@/lib/settlement/hours-text';
import { BATCH_CONFIRMER_LABELS } from '@/lib/settlement/batch-confirmer-rule';
import { listPriorMentorBacklog } from '@/lib/settlement/prior-mentors';
import { hasCapability } from '@/lib/auth/capabilities';
import { formatDate, formatKRW } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

type Tab = 'batches' | 'tax';

/** 운영사 정산 — 지급 대기 건 편성(T8) + 품의 목록 + (P31) KPI 행 · 원천세 탭(지급일 기준) */
export default async function Page({ searchParams }: { searchParams: { tab?: string; year?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  // (2026-11-16) 정산 건 탭(지급 대기·전체) 폐지 — 지급 품의 한 화면에서 끝낸다. 옛 ?tab=pending|all 은 기본 화면으로
  const tab: Tab = searchParams.tab === 'tax' ? 'tax' : 'batches';
  const groupId = ctx.supportTypeId ?? undefined;
  const kpi = await computeSettlementKpi(ctx.programId, groupId ?? null);

  const kpiRow = (
    <>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border-2 bg-background p-3">
          <p className="text-xs text-muted-foreground">지급 예정 합계 (제출·확인 완료, 미지급)</p>
          <p className="text-lg font-bold tabular-nums">{formatKRW(kpi.scheduledNet)}</p>
          <p className="text-[11px] text-muted-foreground">품의 {kpi.scheduledBatches}건 · 실지급 기준</p>
        </div>
        <div className={`rounded-xl border-2 bg-background p-3 ${kpi.waitingBatches.some((b) => b.days >= 7) ? 'border-amber-400' : ''}`}>
          <p className="text-xs text-muted-foreground">정산 확인 대기 품의 (제출됨)</p>
          <p className="text-lg font-bold tabular-nums">{kpi.waitingBatches.length}건{kpi.waitingBatches[0] ? ` · 최장 ${kpi.waitingBatches[0].days}일` : ''}</p>
          <p className="truncate text-[11px] text-muted-foreground">{kpi.waitingBatches.slice(0, 2).map((b) => `${b.title} (${b.days}일)`).join(' · ') || '대기 중인 품의 없음'}</p>
        </div>
        <div className="rounded-xl border-2 bg-background p-3">
          <p className="text-xs text-muted-foreground">멘토별 미지급 누계 (확정~지급 전)</p>
          <p className="text-lg font-bold tabular-nums">{formatKRW(kpi.unpaidTotalNet)}</p>
          <p className="truncate text-[11px] text-muted-foreground">{kpi.unpaidByMentor.slice(0, 3).map((m) => `${m.mentorName} ${formatKRW(m.net)}`).join(' · ') || '미지급 정산 없음'}</p>
        </div>
      </div>
      <MentoringExportBar programId={ctx.programId} groupId={groupId ?? null} groupName={ctx.group?.name ?? null} />
    </>
  );

  if (tab === 'tax') {
    const year = searchParams.year && /^\d{4}$/.test(searchParams.year) ? Number(searchParams.year) : null;
    const t = await computeTaxSummary(ctx.programId, groupId ?? null, year);
    const sum = (k: 'count' | 'gross' | 'incomeTax' | 'localTax' | 'withholding' | 'net') => t.months.reduce((a, m) => a + m[k], 0);
    return (
      <main className="flex flex-col gap-6">
        <Header ctx={{ groupName: ctx.group?.name ?? null }} />
        {kpiRow}
        <Tabs tab={tab} />
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

  const [batches, scopedBatched, priorBacklog, unbatched, openRows] = await Promise.all([
    listBatches(ctx.programId),
    // 그룹 범위면 그 그룹의 정산 건이 든 품의만 보여준다 (품의 자체는 행사 단위)
    groupId ? listSettlements({ programId: ctx.programId, supportTypeId: groupId, status: ['batched', 'confirmed', 'paid'] }) : Promise.resolve(null),
    listPriorMentorBacklog(ctx.programId),
    listUnbatchedPending(ctx.programId, groupId ?? null),
    loadOpenProgress(ctx.programId, groupId ?? null),
  ]);
  const batchIdsInScope = scopedBatched ? new Set(scopedBatched.map((s) => s.batch_id).filter((x): x is string => !!x)) : null;
  const visibleBatches = (batchIdsInScope ? batches.filter((b) => batchIdsInScope.has(b.id)) : batches).filter((b) => b.itemCount > 0);
  const extras = await loadBatchListExtras(ctx.programId, groupId ?? null, visibleBatches.map((b) => b.id));
  const submitted = visibleBatches.filter((b) => b.status === 'submitted');
  // (2026-11-16) 기본 = 운영사가 정산 확인. 발주처 [정산 품의] 기능을 켠 라운드의 품의만 발주처 확인
  const operatorWaiting = submitted.filter((b) => b.confirmer === 'operator');
  const institutionWaiting = submitted.filter((b) => b.confirmer === 'institution');
  const canConfirm = hasCapability(ctx, 'settlement.submit');
  const canSettle = hasCapability(ctx, 'settlement') && canConfirm;
  const anyInstitution = batches.some((b) => b.confirmer === 'institution');

  return (
    <main className="flex flex-col gap-6">
      <Header ctx={{ groupName: ctx.group?.name ?? null }} />

      <SettlementFlowStrip current={operatorWaiting.length > 0 ? 4 : 2} institution={anyInstitution} />
      {kpiRow}
      <Tabs tab={tab} />
      {priorBacklog.caseIds.length > 0 && (
        <PriorMentorBacklog cases={priorBacklog.caseIds.length} unsettledRounds={priorBacklog.unsettledRounds} pendingPartials={priorBacklog.pendingPartials} canRun={canSettle} />
      )}
      {unbatched.length > 0 && <PendingBatchBanner count={unbatched.length} net={unbatched.reduce((a, s) => a + s.net, 0)} canRun={canSettle} />}
      {institutionWaiting.length > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
          {fmt('{client} 정산 확인을 기다리는 품의', ctx.branding)} {institutionWaiting.length}건이 있습니다(발주처 정산 품의 기능을 켠 라운드). 확인이 끝나면 [지급 완료]를 눌러 지급을 기록하세요.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">지급 품의</h2>
          <span className="rounded-full bg-brand-coral/15 px-2.5 py-0.5 text-sm font-bold tabular-nums text-brand-coral" title="품의에 오른 멘티 수(중복 제외) / 전체 멘티 수">
            멘티 {extras.listedMentees} / {extras.totalMentees}명
          </span>
          {batchIdsInScope && <span className="text-xs text-muted-foreground">{ctx.group?.name} 정산 건이 포함된 품의만 표시</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canConfirm && operatorWaiting.length > 1 && <BulkConfirmBatchesButton batchIds={operatorWaiting.map((b) => b.id)} totalNet={operatorWaiting.reduce((a, b) => a + Number(b.total_net), 0)} />}
            <ExcelButton href="/api/nextlab/settlements-export" label="정산 엑셀" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          검수 승인하면 멘토별 지급 품의가 자동으로 여기에 올라옵니다. 행의 <b className="text-brand-coral">[정산 확인]</b>을 누르면 그 멘티는 종결되고 확인 날짜가 표시됩니다. 회차 일시를 고쳐야 하는 건은 제목을 눌러 품의 상세에서 <b>[검수로 되돌리기]</b> 하세요.
        </p>
        {visibleBatches.length === 0 ? (
          <EmptyState icon={FolderOpen} title="아직 품의가 없습니다" hint="검수 화면에서 검수 승인하면 멘토별 지급 품의가 자동으로 만들어져 여기에 나타납니다." />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-right">연번</th>
                  <th className="px-3 py-2">제목</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="hidden px-3 py-2 lg:table-cell">확인 주체</th>
                  <th className="px-3 py-2 text-right">건수</th>
                  <th className="px-3 py-2 text-right">진행 시간</th>
                  <th className="hidden px-3 py-2 text-right md:table-cell">지급총액</th>
                  <th className="px-3 py-2 text-right">실지급</th>
                  <th className="hidden px-3 py-2 md:table-cell">제출</th>
                  <th className="px-3 py-2">정산 확인</th>
                  <th className="hidden px-3 py-2 md:table-cell">지급</th>
                </tr>
              </thead>
              <tbody>
                {visibleBatches.map((b, i) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/nextlab/settlements/batches/${b.id}`} className="hover:underline">
                        {b.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs"><StatusBadge kind="batch" status={b.status} /></td>
                    <td className="hidden px-3 py-2 text-xs lg:table-cell">{BATCH_CONFIRMER_LABELS[b.confirmer]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.itemCount}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{hoursText(extras.minutesByBatch.get(b.id) ?? 0)}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatKRW(Number(b.total_gross))}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKRW(Number(b.total_net))}</td>
                    <td className="hidden px-3 py-2 text-xs tabular-nums md:table-cell">{formatDate(b.submitted_at)}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">
                      {b.confirmed_at ? (
                        formatDate(b.confirmed_at)
                      ) : b.status === 'submitted' && b.confirmer === 'operator' && canConfirm ? (
                        <BatchRowConfirmButton batchId={b.id} title={b.title} net={Number(b.total_net)} count={b.itemCount} />
                      ) : b.status === 'submitted' && b.confirmer === 'institution' ? (
                        <span className="text-muted-foreground">발주처 확인 대기</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-xs tabular-nums md:table-cell">
                      {b.paid_at ? formatDate(b.paid_at) : b.status === 'confirmed' && canConfirm ? <BatchRowPaidButton batchId={b.id} title={b.title} net={Number(b.total_net)} /> : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-semibold">아직 검수·정산에 들어오지 않은 멘티</h2>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-bold tabular-nums">{openRows.length}명</span>
          <span className="text-xs text-muted-foreground">진행 중인 멘티 + 멘토가 바뀌어 정산에 안 올라온 잔여 회차가 있는 멘티 (검수 대기 중인 멘티는 [검수] 화면)</span>
        </div>
        <OpenProgressPanel rows={openRows} canSms={hasCapability(ctx, 'sms')} />
      </section>
    </main>
  );
}

function Header({ ctx }: { ctx: { groupName: string | null } }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">정산 · 지급 품의</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        검수 승인(종결)·중도 종료 시 확정된 정산이 멘토별 지급 품의로 자동으로 올라옵니다. 이 화면에서 품의마다 [정산 확인] → [지급 완료]를 누르면 끝납니다. 수당 산출내역 엑셀도 여기서 내려받으세요. {ctx.groupName ? `(${ctx.groupName})` : ''}
      </p>
    </div>
  );
}

function Tabs({ tab }: { tab: Tab }) {
  return (
    <SubTabs
      ariaLabel="정산 보기"
      active={tab}
      items={[
        { key: 'batches', label: '지급 품의', href: '/nextlab/settlements', icon: FolderOpen },
        { key: 'tax', label: '원천세', href: '/nextlab/settlements?tab=tax', icon: Landmark },
      ]}
    />
  );
}
