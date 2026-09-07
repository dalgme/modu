import Link from 'next/link';

import type { BatchItem, SettlementItem } from '@/lib/data/settlements';
import { BATCH_STATUS_LABELS } from '@/lib/data/settlements';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';
import { BatchActions, RemoveFromBatchButton } from '@/components/settlement/batch-actions';
import { formatDateTime, formatKRW } from '@/lib/utils/format';

/** 품의 상세 (운영사·발주처 공용) */
export function BatchDetail({ batch, items, role, caseHrefBase, backHref }: { batch: BatchItem; items: SettlementItem[]; role: 'nextlab' | 'institution'; caseHrefBase: string; backHref: string }) {
  const removable = role === 'nextlab' && batch.status === 'draft';
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
            ← 정산 목록
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{batch.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{BATCH_STATUS_LABELS[batch.status] ?? batch.status}</span>
            <span className="ml-2">작성 {batch.createdByName ?? '-'} · {formatDateTime(batch.created_at)}</span>
            {batch.submitted_at && <span className="ml-2">· 제출 {formatDateTime(batch.submitted_at)}</span>}
            {batch.confirmed_at && <span className="ml-2">· 정산 확인 {batch.confirmedByName ?? ''} {formatDateTime(batch.confirmed_at)}</span>}
            {batch.paid_at && <span className="ml-2">· 지급 {formatDateTime(batch.paid_at)}</span>}
          </p>
          {batch.note && <p className="mt-1 text-sm">{batch.note}</p>}
        </div>
        <BatchActions batchId={batch.id} status={batch.status} role={role} exportHref={`/api/nextlab/batches/${batch.id}/export`} />
      </div>

      <dl className="grid grid-cols-3 gap-3 rounded-xl border bg-background p-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">지급총액</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatKRW(Number(batch.total_gross))}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">원천징수</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatKRW(Number(batch.total_withholding))}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">실지급 요청액 ({items.length}건)</dt>
          <dd className="text-lg font-bold tabular-nums text-primary">{formatKRW(Number(batch.total_net))}</dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">멘토</th>
              <th className="px-3 py-2">멘티(기업·팀)</th>
              <th className="px-3 py-2">그룹</th>
              <th className="px-3 py-2">구분</th>
              <th className="px-3 py-2 text-right">회차</th>
              <th className="px-3 py-2 text-right">지급총액</th>
              <th className="px-3 py-2 text-right">원천징수</th>
              <th className="px-3 py-2 text-right">실지급</th>
              {removable && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{s.mentorName}</td>
                <td className="px-3 py-2">
                  <Link href={`${caseHrefBase}/${s.case_id}`} className="hover:underline">
                    {s.businessName}
                  </Link>
                  <span className="ml-1 text-xs text-muted-foreground">{s.ownerName}</span>
                </td>
                <td className="px-3 py-2 text-xs">{s.supportTypeName ?? '-'}</td>
                <td className="px-3 py-2 text-xs">
                  {s.kind === 'closure' ? '종결' : '부분'} · {WITHHOLDING_LABELS[s.withholding_method as keyof typeof WITHHOLDING_LABELS]}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.roundCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKRW(Number(s.gross))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKRW(Number(s.withholding))}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKRW(Number(s.net))}</td>
                {removable && (
                  <td className="px-3 py-2 text-right">
                    <RemoveFromBatchButton batchId={batch.id} settlementId={s.id} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
