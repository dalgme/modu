import Link from 'next/link';

import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { fmt } from '@/lib/programs/branding';
import { listBatches, listSettlements, BATCH_STATUS_LABELS } from '@/lib/data/settlements';
import { SettlementsTable } from '@/components/settlement/settlements-table';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeBudgetOverview } from '@/lib/reports/budget';
import { BudgetCard } from '@/components/reports/budget-card';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { formatDate, formatKRW } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/** 발주처 정산 확인 (P20 개편) — [품의 도착] / [지출 예상(품의 전)] 미니탭으로 진행 상태를 한눈에 */
export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const tab = searchParams.tab === 'forecast' ? 'forecast' : 'batches';

  let body: React.ReactNode = null;

  if (tab === 'batches') {
    const batches = (await listBatches(ctx.programId)).filter((b) => b.status !== 'draft');
    const waiting = batches.filter((b) => b.status === 'submitted');
    body = (
      <>
        {waiting.length > 0 && (
          <p className="rounded-lg border border-amber-400 bg-amber-50/60 px-4 py-2 text-sm font-semibold text-amber-900">확인 대기 품의 {waiting.length}건</p>
        )}
        <div className="overflow-x-auto rounded-xl border-2 bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">제목</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2 text-right">건수</th>
                <th className="px-3 py-2 text-right">지급총액</th>
                <th className="px-3 py-2 text-right">원천징수</th>
                <th className="px-3 py-2 text-right">실지급</th>
                <th className="px-3 py-2">제출일</th>
                <th className="px-3 py-2">확인일</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
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
                  <td className="px-3 py-2 text-right tabular-nums">{formatKRW(Number(b.total_gross))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKRW(Number(b.total_withholding))}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKRW(Number(b.total_net))}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatDate(b.submitted_at)}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatDate(b.confirmed_at)}</td>
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
    const pending = await listSettlements({ programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined, status: ['pending'] });
    // ② 아직 정산 확정 전 — 이행(보고서 등록)됐지만 정산에 묶이지 않은 회차의 예상 지출 (케이스 단위 합산)
    const admin = createAdminClient();
    let casesQ = admin
      .from('cases')
      .select('id, owner_name, business_name, status, support_types(name)')
      .eq('program_id', ctx.programId)
      .not('status', 'in', '(closed,withdrawn)');
    if (ctx.supportTypeId) casesQ = casesQ.eq('support_type_id', ctx.supportTypeId);
    const { data: openCases } = await casesQ;
    const caseIds = (openCases ?? []).map((c) => c.id);
    const { data: logs } = caseIds.length
      ? await admin
          .from('mentoring_logs')
          .select('case_id, amount_snapshot')
          .in('case_id', caseIds)
          .not('report_registered_at', 'is', null)
          .is('settlement_id', null)
      : { data: [] as { case_id: string; amount_snapshot: number }[] };
    const amountByCase = new Map<string, { amount: number; rounds: number }>();
    for (const l of logs ?? []) {
      const cur = amountByCase.get(l.case_id) ?? { amount: 0, rounds: 0 };
      cur.amount += Number(l.amount_snapshot);
      cur.rounds += 1;
      amountByCase.set(l.case_id, cur);
    }
    const forecastRows = (openCases ?? [])
      .filter((c) => amountByCase.has(c.id))
      .map((c) => ({
        id: c.id,
        ownerName: c.owner_name,
        businessName: c.business_name,
        groupName: (c.support_types as unknown as { name: string } | null)?.name ?? '-',
        status: c.status as CaseStatus,
        rounds: amountByCase.get(c.id)!.rounds,
        amount: amountByCase.get(c.id)!.amount,
      }))
      .sort((a, b) => b.amount - a.amount);
    const forecastTotal = forecastRows.reduce((s, r) => s + r.amount, 0);
    const pendingNet = pending.reduce((s, r) => s + Number(r.net), 0);

    const budget = await computeBudgetOverview(ctx.programId, ctx.supportTypeId ?? null);
    body = (
      <div className="flex flex-col gap-5">
        <BudgetCard overview={budget} />
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border-2 bg-background p-3">
            <p className="text-xs text-muted-foreground">확정 · 품의 대기 (검수 승인)</p>
            <p className="text-lg font-bold tabular-nums">{formatKRW(pendingNet)}</p>
            <p className="text-[11px] text-muted-foreground">{pending.length}건 — 원천징수 반영 실지급 기준</p>
          </div>
          <div className="rounded-xl border-2 bg-background p-3">
            <p className="text-xs text-muted-foreground">진행 중 예상 지출 (검수 전)</p>
            <p className="text-lg font-bold tabular-nums">{formatKRW(forecastTotal)}</p>
            <p className="text-[11px] text-muted-foreground">{forecastRows.length}건 — 이행 회차 단가 합계(원천징수 전)</p>
          </div>
          <div className="rounded-xl border-2 bg-background p-3">
            <p className="text-xs text-muted-foreground">합계 (품의 상신 이전 전 단계)</p>
            <p className="text-lg font-bold tabular-nums">{formatKRW(pendingNet + forecastTotal)}</p>
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
                {forecastRows.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">예상 지출 건이 없습니다.</td></tr>
                )}
                {forecastRows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/institution/cases/${r.id}`} className="hover:underline">{r.ownerName}<span className="font-normal text-muted-foreground">/{r.businessName}</span></Link>
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
        <p className="mt-1 text-sm text-muted-foreground">{fmt('{operator}가 제출한 지급 품의와, 품의 상신 이전 단계의 지출 예상을 확인합니다.', ctx.branding)}</p>
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
