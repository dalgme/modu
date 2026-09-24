import Link from 'next/link';
import { FileText } from 'lucide-react';

import type { SettlementItem } from '@/lib/data/settlements';
import { SETTLEMENT_STATUS_LABELS } from '@/lib/data/settlements';
import { canCancelSettlement } from '@/lib/workflow/transitions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SettlementSummary } from '@/components/settlement/settlement-summary';
import { CancelSettlementButton, ResettlePartialButton } from '@/components/settlement/cancel-settlement-button';
import { formatDateTime } from '@/lib/utils/format';

/**
 * 케이스 상세의 확정 정산 카드 (운영사·발주처·멘토 공용).
 * canCancel = 운영사 'settlement' 권한 (페이지가 hasCapability 로 계산). 취소 가능 조건은 서버와 같은 canCancelSettlement (P31).
 * canResettle = 취소된 부분 정산을 다시 확정하는 버튼 노출(기본 = canCancel). 서버가 "종료된 멘토·미정산 회차 있음"을 재검증한다.
 */
export function SettlementCard({
  items,
  statements,
  canCancel = false,
  canResettle,
  batchHrefBase,
  title = '확정 정산',
}: {
  items: SettlementItem[];
  statements: { id: string; name: string; url: string | null; createdAt: string }[];
  canCancel?: boolean;
  canResettle?: boolean;
  batchHrefBase?: string;
  title?: string;
}) {
  const active = items.filter((s) => s.status !== 'canceled');
  const canceled = items.filter((s) => s.status === 'canceled');
  if (active.length === 0 && canceled.length === 0) return null;
  const resettle = canResettle ?? canCancel;
  // 취소된 partial 중 같은 멘토의 살아있는 정산이 없는 것만 재확정 후보 (멘토별 1버튼)
  const activeMentors = new Set(active.map((s) => s.mentor_id));
  const resettleCandidates = resettle ? Array.from(new Map(canceled.filter((s) => s.kind === 'partial' && !activeMentors.has(s.mentor_id)).map((s) => [s.mentor_id, s])).values()) : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">확정 시점의 단가·세율 스냅샷입니다. 이후 설정 변경에 영향을 받지 않습니다.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {active.map((s) => {
          const policy = (s.withholding_policy ?? {}) as { exempted?: boolean; batch_min_recomputed?: boolean };
          return (
            <div key={s.id} className="rounded-lg border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <b>{s.mentorName}</b> · {s.kind === 'closure' ? '종결 정산' : '부분 정산(중도 종료)'} ·{' '}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{SETTLEMENT_STATUS_LABELS[s.status] ?? s.status}</span>
                  <span className="ml-2 text-xs text-muted-foreground">확정 {formatDateTime(s.confirmed_at)}</span>
                  {s.paid_at && <span className="ml-2 text-xs text-muted-foreground">· 지급 {formatDateTime(s.paid_at)}</span>}
                  {policy.batch_min_recomputed && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">품의 단위 과세최저한 재계산</span>}
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
                  {canCancel && canCancelSettlement(s) && <CancelSettlementButton settlementId={s.id} kind={s.kind === 'closure' ? 'closure' : 'partial'} mentorName={s.mentorName} net={Number(s.net)} />}
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
          <div className="flex flex-col gap-2 text-xs text-muted-foreground">
            <p>취소된 정산 {canceled.length}건: {canceled.map((s) => `${s.mentorName} · ${s.kind === 'closure' ? '종결' : '부분'} (${s.cancel_reason ?? '-'})`).join(' · ')}</p>
            {resettleCandidates.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {resettleCandidates.map((s) => (
                  <ResettlePartialButton key={s.mentor_id} caseId={s.case_id} mentorId={s.mentor_id} mentorName={s.mentorName} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
