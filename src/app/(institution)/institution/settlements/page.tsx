import Link from 'next/link';

import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { fmt } from '@/lib/programs/branding';
import { listBatches, listSettlements, BATCH_STATUS_LABELS } from '@/lib/data/settlements';
import { SettlementsTable } from '@/components/settlement/settlements-table';
import { computeBudgetOverview, computeForecastByCase } from '@/lib/reports/budget';
import { BudgetCard } from '@/components/reports/budget-card';
import { CASE_STATUS_META } from '@/types/case-status';
import { formatDate, formatKRW } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/**
 * 발주처 정산 확인 (P20 개편) — [품의 도착] / [지출 예상(품의 전)] 미니탭.
 * (P31) 지출 예상은 budget.ts 의 공용 함수(예산 게이지와 같은 조건)로, 그룹 범위는 운영사 정산 화면과 같은 규칙(그 그룹 정산이 든 품의만), 지급일 컬럼.
 */
export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const tab = searchParams.tab === 'forecast' ? 'forecast' : 'batches';
  const groupId = ctx.supportTypeId ?? undefined;

  let body: React.ReactNode = null;

  if (tab === 'batches') {
    const [all, scoped] = await Promise.all([
      listBatches(ctx.programId),
      groupId ? listSettlements({ programId: ctx.programId, supportTypeId: groupId, status: ['batched', 'confirmed', 'paid'] }) : Promise.resolve(null),
    ]);
    const inScope = scoped ? new Set(scoped.map((s) => s.batch_id).filter((x): x is string => !!x)) : null;
    const batches = all.filter((b) => b.status !== 'draft').filter((b) => !inScope || inScope.has(b.id));
    const waiting = batches.filter((b) => b.status === 'submitted');
    body = (
      <>
        {waiting.length > 0 && (
          <p className="rounded-lg border border-amber-400 bg-amber-50/60 px-4 py-2 text-sm font-semibold text-amber-900">확인 대기 품의 {waiting.length}건</p>
        )}
        {inScope && <p className="text-xs text-muted-foreground">{ctx.group?.name} 정산 건이 포함된 품의만 표시합니다. 행사 전체 품의는 범위를 [행사 전체]로 바꾸세요.</p>}
        <div className="overflow-x-auto rounded-xl border-2 bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">제목</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2 text-right">건수</th>
                <th className="hidden px-3 py-2 text-right md:table-cell">지급총액(세전)</th>
                <th className="hidden px-3 py-2 text-right md:table-cell">원천징수</th>
                <th className="px-3 py-2 text-right">실지급</th>
                <th className="px-3 py-2">제출일</th>
                <th className="hidden px-3 py-2 md:table-cell">확인일</th>
                <th className="hidden px-3 py-2 md:table-cell">지급일</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    제출된 품의가 없습니다.
                  </td>
                </tr>
              )}
              {batches.map((b) => (
                <tr key={b.id} className={`border-b last:border-0 ${b.status === 'submitted' ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/institution/settlements/${b.id}`} className="hover:underline">
                      {b.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{BATCH_STATUS_LABELS[b.status] ?? b.status}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.itemCount}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatKRW(Number(b.total_gross))}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatKRW(Number(b.total_withholding))}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKRW(Number(b.total_net))}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatDate(b.submitted_at)}</td>
                  <td className="hidden px-3 py-2 text-xs tabular-nums md:table-cell">{formatDate(b.confirmed_at)}</td>
                  <td className="hidden px-3 py-2 text-xs tabular-nums md:table-cell">{formatDate(b.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  if (tab === 'forecast') {
    // ① 검수 승인·정산 확정 후 품의 대기 (settlements status = pending)
    // ② 아직 정산 확정 전 — 이행(보고서 등록)됐지만 정산에 묶이지 않은 회차의 예상 지출 (케이스 단위, 예산 게이지와 같은 함수)
    const [pending, forecast, budget] = await Promise.all([
      listSettlements({ programId: ctx.programId, supportTypeId: groupId, status: ['pending'] }),
      computeForecastByCase(ctx.programId, groupId ?? null),
      computeBudgetOverview(ctx.programId, groupId ?? null),
    ]);
    const pendingGross = pending.reduce((s, r) => s + Number(r.gross), 0);
    const pendingNet = pending.reduce((s, r) => s + Number(r.net), 0);

    body = (
      <div className="flex flex-col gap-5">
        <BudgetCard overview={budget} />
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border-2 bg-background p-3">
            <p className="text-xs text-muted-foreground">확정 · 품의 대기 (검수 승인)</p>
            <p className="text-lg font-bold tabular-nums">{formatKRW(pendingGross)}</p>
            <p className="text-[11px] text-muted-foreground">{pending.length}건 — 지급총액(세전) · 실지급 {formatKRW(pendingNet)}</p>
          </div>
          <div className="rounded-xl border-2 bg-background p-3">
            <p className="text-xs text-muted-foreground">진행 중 예상 지출 (검수 전)</p>
            <p className="text-lg font-bold tabular-nums">{formatKRW(forecast.total)}</p>
            <p className="text-[11px] text-muted-foreground">{forecast.rows.length}건 — 이행 회차 단가 합계(세전)</p>
          </div>
          <div className="rounded-xl border-2 bg-background p-3">
            <p className="text-xs text-muted-foreground">합계 (품의 상신 이전 전 단계) · 세전</p>
            <p className="text-lg font-bold tabular-nums">{formatKRW(pendingGross + forecast.total)}</p>
            <p className="text-[11px] text-muted-foreground">지급총액 기준 — 예산 게이지와 같은 기준</p>
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold">① 검수 승인 완료 — 지급 품의 대기</h2>
          <p className="mb-2 text-xs text-muted-foreground">{fmt('{operator}가 검수를 승인해 정산이 확정된 건입니다. 다음 품의에 편성되면 [품의 도착] 탭으로 넘어옵니다.', ctx.branding)}</p>
          <SettlementsTable items={pending} caseHrefBase="/institution/cases" batchHrefBase="/institution/settlements" />
        </div>

        <div>
          <h2 className="text-base font-semibold">② 진행 중 — 이행 회차 기준 예상 지출</h2>
          <p className="mb-2 text-xs text-muted-foreground">보고서까지 등록된(이행) 회차의 단가 합계입니다. 종결 검수 승인 시 원천징수를 반영해 확정됩니다.</p>
          <div className="overflow-x-auto rounded-xl border-2 bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">멘티 (이름/소속)</th>
                  <th className="px-3 py-2">그룹</th>
                  <th className="px-3 py-2">진행 상태</th>
                  <th className="px-3 py-2 text-right">이행 회차</th>
                  <th className="px-3 py-2 text-right">예상 금액</th>
                </tr>
              </thead>
              <tbody>
                {forecast.rows.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">예상 지출 건이 없습니다.</td></tr>
                )}
                {forecast.rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/institution/cases/${r.id}`} className="hover:underline">{r.ownerName}{r.businessName && r.businessName !== r.ownerName && <span className="font-normal text-muted-foreground">/{r.businessName}</span>}</Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.groupName}</td>
                    <td className="px-3 py-2 text-xs">{CASE_STATUS_META[r.status].short}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.rounds}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKRW(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">정산 확인</h1>
        <p className="mt-1 text-sm text-muted-foreground">{fmt('{operator}가 제출한 지급 품의와, 품의 상신 이전 단계의 지출 예상을 확인합니다.', ctx.branding)}{ctx.group ? ` (${ctx.group.name})` : ''}</p>
      </div>
      <nav className="flex flex-wrap gap-1.5">
        <Link href="/institution/settlements" className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === 'batches' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
          품의 도착
        </Link>
        <Link href="/institution/settlements?tab=forecast" className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === 'forecast' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
          지출 예상 (품의 전)
        </Link>
      </nav>
      {body}
    </main>
  );
}
