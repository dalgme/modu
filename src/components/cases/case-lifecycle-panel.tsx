'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  withdrawCaseAction,
  changeApprovalAction,
  markNotifiedAction,
} from '@/lib/workflow/case-lifecycle-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';

/**
 * 케이스 생애주기 처리.
 *  - ① 승인 통보 완료(approved→notified): 알림 실패 시 수동 fallback — 넥스트랩·진흥원 공용.
 *  - ② 사업 변경 승인(붙임11): 진흥원 전용(자금 권한자).
 *  - ③ 종료/포기(붙임12): 넥스트랩·진흥원 공용.
 * showChange=false 면 ②를 숨긴다(넥스트랩). 종결(포기·지급완료) 상태에서는 노출하지 않는다.
 */
export function CaseLifecyclePanel({
  caseId,
  status,
  showChange = true,
  showWithdraw = true,
}: {
  caseId: string;
  status: CaseStatus;
  /** 사업 변경 승인(붙임11, 진흥원 전용) 노출 여부. 넥스트랩은 false. */
  showChange?: boolean;
  /** 종료/포기(붙임12) 노출 여부. 기본 노출(넥스트랩·진흥원). */
  showWithdraw?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'change' | 'withdraw' | 'notify' | null>(null);

  const terminal = status === 'withdrawn' || status === 'payment_approved';
  const showNotify = status === 'approved';
  if (terminal || (!showChange && !showWithdraw && !showNotify)) return null;

  async function onMarkNotified() {
    if (
      !window.confirm(
        '승인 결과 통보를 완료 처리할까요? 케이스가 증빙 등록 단계로 진행됩니다.\n(알림톡/SMS가 자동 발송되지 않은 경우 신청자에게 별도로 안내해 주세요.)',
      )
    )
      return;
    setBusy('notify');
    const result = await markNotifiedAction(caseId);
    setBusy(null);
    if (result.ok) {
      toast({ title: '통보 완료로 처리했습니다. 증빙 등록 단계로 진행됩니다.' });
      router.refresh();
    } else {
      toast({ title: '처리 실패', description: result.error, variant: 'destructive' });
    }
  }

  async function onChangeApproval() {
    setBusy('change');
    const result = await changeApprovalAction(caseId, note);
    setBusy(null);
    if (result.ok) {
      toast({ title: '변경 승인이 기록되었습니다.' });
      setNote('');
      router.refresh();
    } else {
      toast({ title: '처리 실패', description: result.error, variant: 'destructive' });
    }
  }

  async function onWithdraw() {
    if (!window.confirm('이 케이스를 지원 포기(종결) 처리할까요? 되돌릴 수 없습니다.')) return;
    setBusy('withdraw');
    const result = await withdrawCaseAction(caseId, reason);
    setBusy(null);
    if (result.ok) {
      toast({ title: '지원 포기(종결) 처리되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '처리 실패', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {showChange || showWithdraw ? '변경 · 종료/포기 처리' : '승인 통보 처리'}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {showNotify && (
          <div className="flex flex-col gap-2 rounded-md border border-status-progress/40 bg-status-progress/5 p-3">
            <p className="text-sm font-medium text-status-progress">승인 통보 완료 처리</p>
            <p className="text-xs text-muted-foreground">
              승인되었으나 아직 통보 완료(다음 단계 진행)로 전이되지 않았습니다. 알림톡·SMS가 자동
              발송되면 자동으로 처리되지만, 채널 미설정·발송 실패 시 아래 버튼으로 수동 확정해
              신청자의 증빙 등록 단계로 진행시킬 수 있습니다.
            </p>
            <div>
              <Button
                type="button"
                size="sm"
                disabled={busy !== null}
                onClick={onMarkNotified}
              >
                {busy === 'notify' ? '처리 중…' : '통보 완료 처리 (증빙 등록 단계로)'}
              </Button>
            </div>
          </div>
        )}
        {showChange && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">사업 변경 승인 (붙임11)</p>
            <p className="text-xs text-muted-foreground">
              시공업체·금액·내용 변경 등 승인 내용을 기록합니다. 케이스 단계는 그대로 유지됩니다.
            </p>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 시공업체 변경 승인 (○○ → △△), 사유…"
            />
            <div>
              <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={onChangeApproval}>
                {busy === 'change' ? '기록 중…' : '변경 승인 기록'}
              </Button>
            </div>
          </div>
        )}

        {showWithdraw && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 p-3">
            <p className="text-sm font-medium text-destructive">종료/포기 처리 (붙임12)</p>
            <p className="text-xs text-muted-foreground">
              신청자가 지원을 포기했거나 종료가 필요한 경우 케이스를 종결합니다. 멘토 배정은 이력으로만
              남고, 자동 발송 문자 등 연동 기능에서 제외됩니다.
            </p>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="종료/포기 사유 (필수)"
            />
            <div>
              <Button type="button" variant="destructive" size="sm" disabled={busy !== null} onClick={onWithdraw}>
                {busy === 'withdraw' ? '처리 중…' : '종료/포기(종결) 처리'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">현재 단계: {CASE_STATUS_META[status].label}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
