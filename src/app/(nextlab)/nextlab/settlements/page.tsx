import Link from 'next/link';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listBatches, listSettlements, BATCH_STATUS_LABELS } from '@/lib/data/settlements';
import { SettlementsTable } from '@/components/settlement/settlements-table';
import { formatDate, formatKRW } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/** 운영사 정산 — 지급 대기 건 편성(T8) + 품의 목록 */
export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const tab = searchParams.tab === 'all' ? 'all' : 'pending';
  const [settlements, batches] = await Promise.all([
    listSettlements({ programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined, status: tab === 'pending' ? ['pending'] : undefined }),
    listBatches(ctx.programId),
  ]);
  const drafts = batches.filter((b) => b.status === 'draft');

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">정산 · 지급 품의</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          검수 승인(종결)·중도 종료 시 확정된 정산 건을 골라 지급 품의를 편성하고 발주처에 제출합니다. {ctx.group ? `(${ctx.group.name})` : ''}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">정산 건</h2>
          <Link href="/nextlab/settlements?tab=pending" className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === 'pending' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            지급 대기
          </Link>
          <Link href="/nextlab/settlements?tab=all" className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            전체
          </Link>
        </div>
        <SettlementsTable items={settlements} selectable={tab === 'pending'} draftBatches={drafts.map((b) => ({ id: b.id, title: b.title }))} caseHrefBase="/nextlab/cases" batchHrefBase="/nextlab/settlements/batches" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">지급 품의</h2>
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">제목</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2 text-right">건수</th>
                <th className="px-3 py-2 text-right">지급총액</th>
                <th className="px-3 py-2 text-right">실지급</th>
                <th className="px-3 py-2">제출</th>
                <th className="px-3 py-2">정산 확인</th>
                <th className="px-3 py-2">지급</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    품의가 없습니다. 위에서 지급 대기 건을 선택해 편성하세요.
                  </td>
                </tr>
              )}
              {batches.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/nextlab/settlements/batches/${b.id}`} className="hover:underline">
                      {b.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{BATCH_STATUS_LABELS[b.status] ?? b.status}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.itemCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKRW(Number(b.total_gross))}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKRW(Number(b.total_net))}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatDate(b.submitted_at)}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatDate(b.confirmed_at)}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatDate(b.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
