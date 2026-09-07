import Link from 'next/link';
import { FileText } from 'lucide-react';

import type { SettlementItem } from '@/lib/data/settlements';
import { SETTLEMENT_STATUS_LABELS } from '@/lib/data/settlements';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SettlementSummary } from '@/components/settlement/settlement-summary';
import { CancelSettlementButton } from '@/components/settlement/cancel-settlement-button';
import { formatDateTime } from '@/lib/utils/format';

/** 케이스 상세의 확정 정산 카드 (운영사·발주처·멘토 공용, canCancel 은 운영사만) */
export function SettlementCard({
  items,
  statements,
  canCancel = false,
  batchHrefBase,
  title = '확정 정산',
}: {
  items: SettlementItem[];
  statements: { id: string; name: string; url: string | null; createdAt: string }[];
  canCancel?: boolean;
  batchHrefBase?: string;
  title?: string;
}) {
  const active = items.filter((s) => s.status !== 'canceled');
  const canceled = items.filter((s) => s.status === 'canceled');
  if (active.length === 0 && canceled.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">확정 시점의 단가·세율 스냅샷입니다. 이후 설정 변경에 영향을 받지 않습니다.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {active.map((s) => {
          const policy = (s.withholding_policy ?? {}) as { exempted?: boolean };
          return (
            <div key={s.id} className="rounded-lg border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <b>{s.mentorName}</b> · {s.kind === 'closure' ? '종결 정산' : '부분 정산(중도 종료)'} ·{' '}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{SETTLEMENT_STATUS_LABELS[s.status] ?? s.status}</span>
                  <span className="ml-2 text-xs text-muted-foreground">확정 {formatDateTime(s.confirmed_at)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {s.batch_id && s.batchTitle && (
                    batchHrefBase ? (
                      <Link href={`${batchHrefBase}/${s.batch_id}`} className="text-xs text-primary hover:underline">
                        품의: {s.batchTitle}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">품의: {s.batchTitle}</span>
                    )
                  )}
                  {canCancel && s.status === 'pending' && !s.batch_id && <CancelSettlementButton settlementId={s.id} />}
                </span>
              </div>
              <SettlementSummary
                f={{ lines: s.linesParsed, gross: Number(s.gross), taxable: Number(s.taxable), income_tax: Number(s.income_tax), local_tax: Number(s.local_tax), withholding: Number(s.withholding), net: Number(s.net), method: s.withholding_method as 'other_income' | 'business_income' | 'none', exempted: !!policy.exempted }}
              />
            </div>
          );
        })}
        {statements.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {statements.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                    {d.name}
                  </a>
                ) : (
                  d.name
                )}
                <span className="text-xs text-muted-foreground">{formatDateTime(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {canceled.length > 0 && (
          <p className="text-xs text-muted-foreground">
            취소된 정산 {canceled.length}건: {canceled.map((s) => `${s.mentorName} (${s.cancel_reason ?? '-'})`).join(' · ')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
