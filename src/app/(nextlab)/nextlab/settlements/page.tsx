import Link from 'next/link';
import { Clock, FolderOpen, Layers } from 'lucide-react';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listBatches, listSettlements } from '@/lib/data/settlements';
import { SettlementsTable } from '@/components/settlement/settlements-table';
import { SettlementFlowStrip } from '@/components/settlement/settlement-flow-strip';
import { StatusBadge } from '@/components/cases/status-badge';
import { SubTabs } from '@/components/common/sub-tabs';
import { EmptyState } from '@/components/common/empty-state';
import { formatDate, formatKRW } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/** 운영사 정산 — 지급 대기 건 편성(T8) + 품의 목록 */
export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const tab = searchParams.tab === 'all' ? 'all' : 'pending';
  const groupId = ctx.supportTypeId ?? undefined;
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
      <div>
        <h1 className="text-2xl font-semibold">정산 · 지급 품의</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          검수 승인(종결)·중도 종료 시 확정된 정산 건을 골라 지급 품의를 편성하고 발주처에 제출합니다. {ctx.group ? `(${ctx.group.name})` : ''}
        </p>
      </div>

      <SettlementFlowStrip current={drafts.length > 0 ? 3 : 2} />
      {submitted.length > 0 && (
        <p className="rounded-lg border border-sky-300 bg-sky-50/60 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950/20 dark:text-sky-100">
          발주처 정산 확인을 기다리는 품의 {submitted.length}건이 있습니다. 확인이 끝나면 품의 상세에서 [지급 완료]를 눌러 케이스를 종결하세요.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">정산 건</h2>
          <SubTabs
            ariaLabel="정산 건 보기"
            active={tab}
            items={[
              { key: 'pending', label: '지급 대기', href: '/nextlab/settlements?tab=pending', icon: Clock, count: pendingN },
              { key: 'all', label: '전체', href: '/nextlab/settlements?tab=all', icon: Layers },
            ]}
          />
        </div>
        <SettlementsTable
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
