import Link from 'next/link';

import type { BatchItem, SettlementItem } from '@/lib/data/settlements';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';
import { BatchActions, BatchBackLink, RemoveFromBatchButton, ReopenSettlementButton } from '@/components/settlement/batch-actions';
import { BATCH_CONFIRMER_LABELS } from '@/lib/settlement/batch-confirmer-rule';
import { canReopenSettlement } from '@/lib/workflow/transitions';
import { BatchMetaForm } from '@/components/settlement/batch-meta-form';
import { StatusBadge } from '@/components/cases/status-badge';
import { formatDateTime, formatKRW } from '@/lib/utils/format';

/** 품의 상세 (운영사·발주처 공용) */
export function BatchDetail({ batch, items, role, caseHrefBase, backHref, canSettle = true, canSubmit = true }: { batch: BatchItem; items: SettlementItem[]; role: 'nextlab' | 'institution'; caseHrefBase: string; backHref: string; /** 운영사 'settlement' 권한 — 편성·제외·삭제·제목 수정 (P31) */ canSettle?: boolean; /** 운영사 'settlement.submit' 권한 — 제출·철회·지급 완료 (P31) */ canSubmit?: boolean }) {
  const removable = role === 'nextlab' && batch.status === 'draft' && canSettle;
  // (2026-11-16) 정산 확인 전(작성 중·제출) 품의의 정산은 검수로 되돌릴 수 있다 — 회차 일시 정정용
  const reopenable = role === 'nextlab' && canSettle && canSubmit && items.some((s) => canReopenSettlement(s, batch.status));
  const hasAction = removable || reopenable;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <BatchBackLink backHref={backHref} />
          <h1 className="mt-1 text-2xl font-semibold">{batch.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <StatusBadge kind="batch" status={batch.status} />
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${batch.confirmer === 'institution' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>{BATCH_CONFIRMER_LABELS[batch.confirmer]}</span>
            <span className="ml-2">작성 {batch.createdByName ?? '-'} · {formatDateTime(batch.created_at)}</span>
            {batch.submitted_at && <span className="ml-2">· 제출 {formatDateTime(batch.submitted_at)}</span>}
            {batch.confirmed_at && <span className="ml-2">· 정산 확인 {batch.confirmedByName ?? ''} {formatDateTime(batch.confirmed_at)}</span>}
            {batch.paid_at && <span className="ml-2">· 지급 {formatDateTime(batch.paid_at)}</span>}
          </p>
          {batch.note && <p className="mt-1 whitespace-pre-wrap text-sm">{batch.note}</p>}
          {role === 'nextlab' && <BatchMetaForm batchId={batch.id} title={batch.title} note={batch.note} status={batch.status} canEdit={canSettle} />}
        </div>
        <BatchActions batchId={batch.id} status={batch.status} role={role} exportHref={`/api/nextlab/batches/${batch.id}/export`} pdfHref={`/api/nextlab/batches/${batch.id}/pdf`} itemCount={items.length} totalNet={formatKRW(Number(batch.total_net))} afterDeleteHref={backHref} canSubmit={canSubmit} canMarkPaid={canSubmit} canDelete={canSettle} confirmer={batch.confirmer} />
      </div>

      {/* (P31) 폰은 세로 1열 */}
      <dl className="grid grid-cols-1 gap-2 rounded-xl border bg-background p-4 text-sm sm:grid-cols-3 sm:gap-3">
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

      {reopenable && (
        <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
          멘토링 일정 시간과 보고서 시간이 다른 건은 행의 <b>[검수로 되돌리기]</b>로 품의에서 빼고 케이스 화면에서 회차를 정정한 뒤 다시 정산하세요. 정산 확인 후에는 되돌릴 수 없습니다.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">멘토</th>
              <th className="px-3 py-2">멘티(기업·팀)</th>
              {/* (P31) 폰에서는 그룹·구분·원천징수 열 숨김 */}
              <th className="hidden px-3 py-2 md:table-cell">그룹</th>
              <th className="hidden px-3 py-2 md:table-cell">구분</th>
              <th className="px-3 py-2 text-right">회차</th>
              <th className="px-3 py-2 text-right">지급총액</th>
              <th className="hidden px-3 py-2 text-right md:table-cell">원천징수</th>
              <th className="px-3 py-2 text-right">실지급</th>
              {hasAction && <th className="px-3 py-2" />}
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
                <td className="hidden px-3 py-2 text-xs md:table-cell">{s.supportTypeName ?? '-'}</td>
                <td className="hidden px-3 py-2 text-xs md:table-cell">
                  {s.kind === 'closure' ? '종결' : '부분'} · {WITHHOLDING_LABELS[s.withholding_method as keyof typeof WITHHOLDING_LABELS]}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.roundCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKRW(Number(s.gross))}</td>
                <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatKRW(Number(s.withholding))}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKRW(Number(s.net))}</td>
                {hasAction && (
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {reopenable && canReopenSettlement(s, batch.status) && <ReopenSettlementButton settlementId={s.id} kind={s.kind} label={`${s.mentorName} · ${s.businessName}`} compact />}
                      {removable && <RemoveFromBatchButton batchId={batch.id} settlementId={s.id} label={`${s.mentorName} · ${s.businessName}`} />}
                    </div>
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
