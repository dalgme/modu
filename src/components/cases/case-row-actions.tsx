'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Inbox, BellRing } from 'lucide-react';

import {
  manualReceiveApplicationAction,
  markNotifiedAction,
} from '@/lib/workflow/case-lifecycle-actions';
import { statusStep, CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/**
 * 대시보드 케이스 행의 수동 처리 버튼 (넥스트랩·진흥원 공용).
 *  - 지원신청서 수동 접수: 검수 완료 이전 단계 → 오프라인 접수 시 검수 완료로 전이.
 *  - 승인 통보 완료: 진흥원 승인(approved) 상태 → 통보 완료(증빙 등록 단계)로 전이.
 */
export function CaseRowActions({
  caseId,
  status,
  manuallyReceived = false,
}: {
  caseId: string;
  status: CaseStatus;
  /** 이미 '지원신청서 수동 접수' 처리된 케이스면 버튼 대신 완료 표시 */
  manuallyReceived?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const step = statusStep(status);
  const canReceive = !manuallyReceived && step > 0 && step < CASE_STATUS_META.reviewed.step;
  const canNotify = status === 'approved';
  if (!canReceive && !canNotify && !manuallyReceived) return null;

  async function run(kind: 'receive' | 'notify') {
    const confirmMsg =
      kind === 'receive'
        ? '지원신청서를 수동 접수하여 검수 완료(진흥원 승인 대기)로 처리할까요?'
        : '승인 통보를 완료 처리할까요? (증빙 등록 단계로 진행)';
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    const res =
      kind === 'receive'
        ? await manualReceiveApplicationAction(caseId)
        : await markNotifiedAction(caseId);
    setBusy(false);
    if (res.ok) {
      toast({ title: kind === 'receive' ? '수동 접수 처리되었습니다.' : '통보 완료 처리되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '처리 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {manuallyReceived && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-status-approved/40 bg-status-approved/10 px-2 py-1 text-xs font-medium text-status-approved">
          <Inbox className="h-3 w-3" />
          지원신청서 수동 접수
        </span>
      )}
      {canReceive && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run('receive')}
          className="h-7 gap-1 whitespace-nowrap px-2 text-xs"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Inbox className="h-3 w-3" />}
          지원신청서 수동 접수
        </Button>
      )}
      {canNotify && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run('notify')}
          className="h-7 gap-1 whitespace-nowrap px-2 text-xs"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellRing className="h-3 w-3" />}
          승인 통보 완료
        </Button>
      )}
    </div>
  );
}
