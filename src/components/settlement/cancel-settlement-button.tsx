'use client';

import { useRef, useTransition } from 'react';
import { RotateCcw } from 'lucide-react';

import { cancelSettlementAction, resettlePartialAction } from '@/lib/settlement/actions';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatKRW } from '@/lib/utils/format';

/**
 * 정산 확정 취소 — 공용 확인 다이얼로그(영향 목록 + 사유 입력) (P31).
 * 종류별 결과 문구: closure 취소 = 케이스가 종결 요청 단계로 복귀 / partial 취소 = 케이스 상태 유지·회차 잠금만 해제.
 */
export function CancelSettlementButton({ settlementId, kind = 'closure', mentorName, net }: { settlementId: string; kind?: 'closure' | 'partial'; mentorName?: string; net?: number }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const reason = useRef('');
  return (
    <>
      {dialog}
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={pending}
        onClick={() =>
          void (async () => {
            reason.current = '';
            const ok = await confirm({
              title: kind === 'closure' ? '종결 정산 확정 취소' : '부분 정산 확정 취소',
              description: `${mentorName ? `${mentorName}의 ` : ''}확정 정산${net !== undefined ? ` (실지급 ${formatKRW(net)})` : ''}을 취소합니다. 사유는 감사 로그와 멘토 알림에 남습니다.`,
              impact:
                kind === 'closure'
                  ? ['정산에 묶였던 회차 잠금이 풀리고 정산서 PDF 가 삭제됩니다.', '케이스는 종결 요청 단계로 돌아가 다시 검수합니다.', '멘토에게 취소 알림이 발송됩니다.']
                  : ['정산에 묶였던 회차 잠금이 풀리고 정산서 PDF 가 삭제됩니다.', '케이스 상태는 바뀌지 않습니다. 종료된 멘토라면 [부분 정산 다시 확정]으로 재확정할 수 있습니다.', '멘토에게 취소 알림이 발송됩니다.'],
              confirmLabel: '확정 취소',
              severity: 'danger',
              children: <Textarea autoFocus rows={3} placeholder="취소 사유 (필수)" onChange={(e) => { reason.current = e.target.value; }} />,
            });
            if (!ok) return;
            if (!reason.current.trim()) {
              toast({ title: '취소 사유를 입력하세요.', variant: 'destructive' });
              return;
            }
            start(async () => {
              const r = await cancelSettlementAction(settlementId, reason.current);
              if (!r.ok) {
                toast({ title: r.error, variant: 'destructive' });
                return;
              }
              toast({
                title: r.kind === 'closure' ? (r.caseReverted ? '정산 확정을 취소했습니다. 케이스는 종결 요청 단계로 돌아갑니다.' : '종결 정산 확정을 취소했습니다.') : '부분 정산 확정을 취소했습니다. 케이스 상태는 유지되며 회차 잠금이 풀렸습니다.',
              });
            });
          })()
        }
      >
        확정 취소
      </Button>
    </>
  );
}

/** (P31) 취소된 부분 정산 재확정 — 종료된 멘토의 미정산 이행 회차를 다시 partial 스냅샷으로 */
export function ResettlePartialButton({ caseId, mentorId, mentorName }: { caseId: string; mentorId: string; mentorName?: string }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  return (
    <>
      {dialog}
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 px-2 text-xs"
        disabled={pending}
        onClick={() =>
          void (async () => {
            const ok = await confirm({
              title: '부분 정산 다시 확정',
              description: `${mentorName ? `${mentorName}의 ` : ''}미정산 이행 회차를 현재 단가·세율 스냅샷으로 다시 확정합니다.`,
              impact: ['종료(비활성)된 멘토의 회차만 대상입니다. 활성 멘토분은 종결 검수 승인으로 확정합니다.', '확정되면 지급 대기 건으로 품의에 편성할 수 있고, 멘토에게 확정 알림이 발송됩니다.'],
              confirmLabel: '다시 확정',
            });
            if (!ok) return;
            start(async () => {
              const r = await resettlePartialAction(caseId, mentorId);
              toast(r.ok ? { title: '부분 정산을 다시 확정했습니다.' } : { title: r.error, variant: 'destructive' });
            });
          })()
        }
      >
        <RotateCcw className="h-3.5 w-3.5" /> 부분 정산 다시 확정
      </Button>
    </>
  );
}
