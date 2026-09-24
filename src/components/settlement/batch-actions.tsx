'use client';

import { useRef, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, FileText, Send, Trash2, Undo2, Wallet, X } from 'lucide-react';

import { ExcelButton } from '@/components/common/excel-button';
import { useConfirm, type ConfirmOptions } from '@/components/common/confirm-dialog';
import { canBatchTransition } from '@/lib/workflow/transitions';

import { confirmBatchAction, deleteBatchAction, markBatchPaidAction, previewBatchSubmitAction, removeFromBatchAction, returnBatchAction, submitBatchAction, unsubmitBatchAction } from '@/lib/settlement/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatKRW } from '@/lib/utils/format';

type ActionResult = { ok: true } | { ok: true; batchId: string } | { ok: false; error: string };

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * 품의 상세의 상태 전이 버튼 — role 과 BATCH_TRANSITIONS(canBatchTransition) 로 노출.
 *  운영사: 제출·철회·삭제·지급 완료(지급일 입력) / 발주처: 정산 확인·반려(사유).
 * (P31) can* 는 페이지가 권한표(hasCapability: 'settlement' / 'settlement.submit')로 계산해 내려준다 (기본 true).
 */
export function BatchActions({
  batchId,
  status,
  role,
  exportHref,
  pdfHref,
  itemCount,
  totalNet,
  afterDeleteHref = '/nextlab/settlements',
  canSubmit = true,
  canDelete = true,
  canMarkPaid = true,
  canConfirm = true,
  canReturn = true,
}: {
  batchId: string;
  status: string;
  role: 'nextlab' | 'institution';
  exportHref: string;
  /** 품의 표지 PDF (없으면 버튼 숨김). 발주처는 제출 이후에만 */
  pdfHref?: string;
  itemCount?: number;
  totalNet?: string;
  afterDeleteHref?: string;
  canSubmit?: boolean;
  canDelete?: boolean;
  canMarkPaid?: boolean;
  canConfirm?: boolean;
  canReturn?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const paidOnRef = useRef(kstToday());
  const reasonRef = useRef('');

  const summary = [itemCount !== undefined ? `정산 ${itemCount}건` : null, totalNet ? `실지급 ${totalNet}` : null].filter(Boolean).join(' · ');

  const run = async (opts: ConfirmOptions, doneLabel: string, fn: () => Promise<ActionResult>, after?: () => void) => {
    const ok = await confirm({ ...opts, impact: [...(summary ? [summary] : []), ...(opts.impact ?? [])] });
    if (!ok) return;
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: `${doneLabel} 완료` });
      after?.();
    });
  };

  const submit = async () => {
    // 제출 전 미리보기 — 품의 단위 과세최저한 재계산이 있으면 경고 줄을 보여준다 (P31)
    const preview = await previewBatchSubmitAction(batchId);
    if (!preview.ok) {
      toast({ title: preview.error, variant: 'destructive' });
      return;
    }
    const warn = preview.recompute.map((r) => `과세최저한 재계산: ${r.mentorName} — 이 품의 안 기타소득금액 합계 ${formatKRW(r.combinedTaxable)} > ${formatKRW(r.threshold)} → 면제됐던 ${r.settlementIds.length}건에 원천징수 ${formatKRW(r.extraWithholding)} 추가`);
    const impact = warn.length > 0 ? [...warn, `제출 시 합계: 원천징수 ${formatKRW(preview.totalsAfter.withholding)} · 실지급 ${formatKRW(preview.totalsAfter.net)} (재계산 전 실지급 ${formatKRW(preview.totalsBefore.net)})`] : [];
    await run({ title: '발주처에 제출', description: '이 품의를 발주처에 제출합니다. 제출 후에는 편성 건을 바꿀 수 없으며, 발주처 정산 확인 전까지는 철회할 수 있습니다.', impact, confirmLabel: '제출' }, '제출', () => submitBatchAction(batchId));
  };

  const markPaid = async () => {
    paidOnRef.current = kstToday();
    const ok = await confirm({
      title: '지급 완료 기록',
      description: '정산 건 상태를 지급 완료로 기록합니다. 케이스 종결은 발주처 확인 시 처리됩니다.',
      impact: [...(summary ? [summary] : []), '지급 완료 후에는 되돌릴 수 없습니다.', '멘토에게 실지급액과 지급일이 통보됩니다.'],
      confirmLabel: '지급 완료',
      severity: 'danger',
      children: (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">지급일 (오늘 이후 날짜는 기록할 수 없습니다)</span>
          <input type="date" defaultValue={paidOnRef.current} max={kstToday()} onChange={(e) => { paidOnRef.current = e.target.value; }} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        </label>
      ),
    });
    if (!ok) return;
    start(async () => {
      const r = await markBatchPaidAction(batchId, paidOnRef.current);
      toast(r.ok ? { title: '지급 완료로 기록했습니다.' } : { title: r.error, variant: 'destructive' });
    });
  };

  const returnBatch = async () => {
    reasonRef.current = '';
    const ok = await confirm({
      title: '품의 반려',
      description: '이 품의를 운영사에 돌려보냅니다. 품의는 작성 중 상태로 돌아가고 운영사 담당자에게 알림이 발송됩니다.',
      impact: [...(summary ? [summary] : []), '반려 사유는 품의 메모와 감사 로그에 남습니다.'],
      confirmLabel: '반려',
      severity: 'danger',
      children: <Textarea autoFocus rows={3} placeholder="반려 사유 (필수)" onChange={(e) => { reasonRef.current = e.target.value; }} />,
    });
    if (!ok) return;
    if (!reasonRef.current.trim()) {
      toast({ title: '반려 사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    start(async () => {
      const r = await returnBatchAction(batchId, reasonRef.current);
      toast(r.ok ? { title: '품의를 반려했습니다.' } : { title: r.error, variant: 'destructive' });
    });
  };

  const showPdf = !!pdfHref && (role === 'nextlab' || status !== 'draft');

  return (
    <div className="flex flex-wrap gap-2">
      {dialog}
      <ExcelButton href={exportHref} />
      {showPdf && (
        <Button asChild size="sm" variant="outline" className="gap-1">
          <a href={pdfHref} target="_blank" rel="noreferrer" title="품의 표지 PDF (번호·제목·합계·건별 목록·결재란)">
            <FileText className="h-4 w-4" /> 품의서 PDF
          </a>
        </Button>
      )}
      {role === 'nextlab' && canBatchTransition('submit', status) && canSubmit && (
        <Button size="sm" className="gap-1" disabled={pending} onClick={() => void submit()}>
          <Send className="h-4 w-4" /> 제출
        </Button>
      )}
      {role === 'nextlab' && canBatchTransition('delete', status) && canDelete && (
        <Button size="sm" variant="ghost" className="gap-1 text-destructive" disabled={pending} onClick={() => void run({ title: '품의 삭제', description: '이 품의를 삭제합니다. 편성된 정산 건은 지급 대기로 돌아갑니다.', impact: ['삭제는 되돌릴 수 없습니다(정산 건 자체는 유지).'], confirmLabel: '삭제', severity: 'danger' }, '품의 삭제', () => deleteBatchAction(batchId), () => router.push(afterDeleteHref))}>
          <Trash2 className="h-4 w-4" /> 삭제
        </Button>
      )}
      {role === 'nextlab' && canBatchTransition('unsubmit', status) && canSubmit && (
        <Button size="sm" variant="outline" className="gap-1" disabled={pending} onClick={() => void run({ title: '제출 철회', description: '발주처에 제출한 품의를 철회하고 작성 중 상태로 되돌립니다. 발주처에 철회 알림이 발송됩니다.', confirmLabel: '철회' }, '제출 철회', () => unsubmitBatchAction(batchId))}>
          <Undo2 className="h-4 w-4" /> 제출 철회
        </Button>
      )}
      {role === 'nextlab' && canBatchTransition('mark_paid', status) && canMarkPaid && (
        <Button size="sm" className="gap-1" disabled={pending} onClick={() => void markPaid()}>
          <Wallet className="h-4 w-4" /> 지급 완료
        </Button>
      )}
      {role === 'institution' && canBatchTransition('return', status) && canReturn && (
        <Button size="sm" variant="outline" className="gap-1 text-destructive" disabled={pending} onClick={() => void returnBatch()}>
          <Undo2 className="h-4 w-4" /> 반려
        </Button>
      )}
      {role === 'institution' && canBatchTransition('confirm', status) && canConfirm && (
        <Button size="sm" className="gap-1" disabled={pending} onClick={() => void run({ title: '정산 확인', description: '운영사가 제출한 이 품의의 정산 내역을 확인합니다.', impact: ['열린 정산이 더 없는 케이스는 종결로 확정됩니다(종결·부분 정산 모두).', '확인 후 운영사가 [지급 완료]를 표시합니다.'], confirmLabel: '정산 확인' }, '정산 확인', () => confirmBatchAction(batchId))}>
          <CheckCircle2 className="h-4 w-4" /> 정산 확인
        </Button>
      )}
    </div>
  );
}

export function RemoveFromBatchButton({ batchId, settlementId, label }: { batchId: string; settlementId: string; label?: string }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  return (
    <>
      {dialog}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        title="품의에서 제외"
        aria-label={`${label ?? '정산 건'} 품의에서 제외`}
        onClick={() =>
          void (async () => {
            const ok = await confirm({ title: '품의에서 제외', description: `${label ?? '이 정산 건'}을(를) 품의에서 제외합니다. 제외된 건은 지급 대기로 돌아갑니다.`, confirmLabel: '제외', severity: 'danger' });
            if (!ok) return;
            start(async () => {
              const r = await removeFromBatchAction(batchId, settlementId);
              toast(r.ok ? { title: '제외했습니다.' } : { title: r.error, variant: 'destructive' });
            });
          })()
        }
      >
        <X className="h-4 w-4" />
      </Button>
    </>
  );
}

/** 품의 상세 "← 정산 목록" — 목록에서 넘어올 때 붙은 `?tab=` 을 유지한다 (P30). */
export function BatchBackLink({ backHref, label = '← 정산 목록' }: { backHref: string; label?: string }) {
  const params = useSearchParams();
  const tab = params.get('tab');
  const href = tab && /^[a-z_-]+$/.test(tab) ? `${backHref}?tab=${tab}` : backHref;
  return (
    <Link href={href} className="text-sm text-muted-foreground hover:underline">
      {label}
    </Link>
  );
}
