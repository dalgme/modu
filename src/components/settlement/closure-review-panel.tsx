'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Undo2 } from 'lucide-react';

import { reviewClosureAction } from '@/lib/settlement/actions';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { SettlementSummary, type SettlementFigures } from '@/components/settlement/settlement-summary';
import { formatKRW } from '@/lib/utils/format';

export interface SettledBefore {
  id: string;
  mentorName: string;
  kind: string;
  rounds: number;
  gross: number;
  net: number;
  batchTitle: string | null;
  batchStatus: string | null;
}

const BATCH_STATUS_LABEL: Record<string, string> = { draft: '품의 작성 중', submitted: '품의 제출 · 정산 확인 대기', confirmed: '정산 확인', paid: '지급 완료', returned: '반려' };

export interface ClosureEstimateProp {
  /** 멘토 id — React key (P31). 없으면 mentorName 으로 폴백 */
  mentorId?: string;
  mentorName: string;
  figures: SettlementFigures;
  source: string;
  /** 이 예상에 포함된 회차 id — 승인 시 서버 재계산과 대조 (P31). 모든 항목에 있어야 expected 를 보낸다 */
  roundIds?: string[];
}

/**
 * 운영사 종결 검수 — T6 보완 요청 / T7 승인(+정산 확정).
 * 예상 정산액은 서버에서 computeSettlement 로 계산해 내려온다(확정과 같은 함수).
 * (P31) canApprove 는 서버 `canApproveClosure()` 결과 — 버튼 활성 조건과 서버 게이트가 같은 함수를 읽는다.
 * 승인 요청에 `expected`(실지급 합·회차 id)를 실어 보내 화면과 서버가 다른 값을 보고 있으면 거부된다.
 */
export function ClosureReviewPanel({
  caseId,
  estimates,
  observationUrl,
  canApprove = { ok: true, reason: '' },
  canReview = true,
  canRevise = true,
  settledBefore = [],
}: {
  caseId: string;
  /** (2026-11-18) 이 케이스에서 이미 확정된 정산(부분 정산 등) — 남은 회차가 없어 예상액이 0원일 때 '돈이 빠졌다'로 보이지 않게 함께 보여 준다 */
  settledBefore?: SettledBefore[];
  estimates: ClosureEstimateProp[];
  observationUrl: string | null;
  canApprove?: { ok: boolean; reason: string; settledAlready?: boolean };
  /** 'review' 권한 — 없으면 버튼을 숨긴다 (페이지가 hasCapability(ctx,'review') 로 계산) */
  canReview?: boolean;
  /** 보완 요청 가능 여부 = 전이 상수 review_revision (종결 요청 상태에서만). 종결 요청 전 승인 가능 케이스는 숨김 (2026-10-01) */
  canRevise?: boolean;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [comment, setComment] = useState('');
  const { confirm, dialog } = useConfirm();

  const totalNet = estimates.reduce((s, e) => s + e.figures.net, 0);
  const hasRoundIds = estimates.length > 0 && estimates.every((e) => Array.isArray(e.roundIds));
  const roundIds = hasRoundIds ? estimates.flatMap((e) => e.roundIds ?? []) : [];
  // 서버(reviewClosure)와 동일: 미정산 회차 0건이어도 이미 확정된 정산이 있으면 종결 승인 가능 (P32 리뷰 #7)
  const approveEnabled = canApprove.ok && (estimates.length > 0 || !!canApprove.settledAlready);

  const run = async (result: 'approved' | 'revision_requested') => {
    if (result === 'revision_requested' && !comment.trim()) {
      toast({ title: '보완 요청 사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    const ok = await confirm(
      result === 'approved'
        ? {
            title: '검수 승인 · 정산 확정',
            description: '검수를 승인하고 아래 예상 금액을 확정 스냅샷으로 저장합니다. 확정 후 회차는 잠기며 멘토에게 통보됩니다.',
            impact: [
              estimates.length === 0
                ? '새로 정산할 회차 없음 — 진행한 회차는 이미 정산됨(추가 지급 0원)'
                : `확정 실지급 합계 ${formatKRW(totalNet)}${hasRoundIds ? ` (회차 ${roundIds.length}건)` : ''}`,
              ...estimates.map((e) => `${e.mentorName}: 실지급 ${formatKRW(e.figures.net)} (원천징수 ${formatKRW(e.figures.withholding)})`),
              ...settledBefore.map((b) => `이미 정산: ${b.mentorName} 실지급 ${formatKRW(b.net)}${b.batchTitle ? ` (${b.batchTitle})` : ''}`),
              '승인 즉시 멘토별 지급 품의가 자동으로 작성·제출되어 정산 확인 단계로 넘어갑니다. 정산 확인 전에는 품의 상세의 [검수로 되돌리기]로 이 단계로 되돌릴 수 있습니다.',
            ],
            confirmLabel: '승인 · 확정',
          }
        : { title: '보완 요청', description: `멘토에게 보완을 요청합니다.\n사유: ${comment.trim()}`, impact: ['케이스는 보완 요청 상태가 되고 멘토는 회차·관찰의견서를 수정한 뒤 다시 종결을 요청합니다.'], confirmLabel: '보완 요청' },
    );
    if (!ok) return;
    start(async () => {
      const r = await reviewClosureAction(caseId, result, comment, result === 'approved' && hasRoundIds ? { net: totalNet, roundIds } : null);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: result === 'approved' ? '검수 승인 · 정산 확정' : '보완을 요청했습니다.' });
      setComment('');
    });
  };

  return (
    <Card className="border-primary/40">
      {dialog}
      <CardHeader>
        <CardTitle className="text-base">종결 검수</CardTitle>
        <p className="text-xs text-muted-foreground">
          관찰의견서와 회차를 확인한 뒤 승인하면 아래 예상 금액이 그대로 확정 스냅샷으로 저장됩니다.
          {observationUrl && (
            <>
              {' '}
              <a href={observationUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                관찰의견서 열기
              </a>
            </>
          )}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!canApprove.ok && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>승인 불가: {canApprove.reason}</span>
          </p>
        )}
        {settledBefore.length > 0 && (
          <div className="rounded-lg border border-sky-300 bg-sky-50/70 p-3 text-sm dark:border-sky-800 dark:bg-sky-950/30">
            <p className="font-semibold text-sky-950 dark:text-sky-100">이미 정산된 회차 — 아래 금액은 다시 지급되지 않습니다</p>
            <ul className="mt-1 space-y-0.5 text-xs text-sky-950/90 dark:text-sky-100/90">
              {settledBefore.map((s) => (
                <li key={s.id}>
                  {s.mentorName} · {s.kind === 'partial' ? '부분 정산' : '종결 정산'} {s.rounds}회 · 세전 {formatKRW(s.gross)} · 실지급 {formatKRW(s.net)}
                  {s.batchTitle ? ` · ${s.batchTitle}(${BATCH_STATUS_LABEL[s.batchStatus ?? ''] ?? s.batchStatus ?? ''})` : ' · 품의 편성 전'}
                </li>
              ))}
            </ul>
          </div>
        )}
        {estimates.length === 0 ? (
          settledBefore.length > 0 ? (
            <p className="text-sm text-muted-foreground">새로 정산할 회차가 없습니다 — 진행한 회차는 위처럼 이미 정산됐습니다. 승인하면 추가 금액 없이 종결 단계로 넘어가고, 위 품의가 정산 확인되면 종결됩니다.</p>
          ) : (
            <p className="text-sm text-destructive">정산 대상 회차가 없습니다. 회차가 등록되어야 승인할 수 있습니다.</p>
          )
        ) : (
          estimates.map((e) => (
            <div key={e.mentorId ?? e.mentorName} className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-semibold">
                예상 정산 — {e.mentorName} <span className="text-xs font-normal text-muted-foreground">(원천징수 기준: {e.source})</span>
              </p>
              <SettlementSummary f={e.figures} />
            </div>
          ))
        )}
        {canReview && (
          <>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="검수 의견 (보완 요청 시 필수)" rows={3} disabled={pending} />
            <div className="flex flex-wrap justify-end gap-2">
              {canRevise && (
                <Button variant="outline" onClick={() => void run('revision_requested')} disabled={pending} className="gap-1">
                  <Undo2 className="h-4 w-4" /> 보완 요청
                </Button>
              )}
              <Button onClick={() => void run('approved')} disabled={pending || !approveEnabled} title={approveEnabled ? undefined : canApprove.reason || '정산 대상 회차가 없습니다.'} className="gap-1">
                <CheckCircle2 className="h-4 w-4" /> 검수 승인 · 정산 확정
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
