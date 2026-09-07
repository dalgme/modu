'use client';

import { useTransition } from 'react';

import { cancelSettlementAction } from '@/lib/settlement/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function CancelSettlementButton({ settlementId }: { settlementId: string }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive"
      disabled={pending}
      onClick={() => {
        const reason = prompt('정산 확정을 취소합니다. 사유를 입력하세요 (감사로그에 남습니다).');
        if (!reason || !reason.trim()) return;
        start(async () => {
          const r = await cancelSettlementAction(settlementId, reason);
          toast(r.ok ? { title: '정산 확정을 취소했습니다. 케이스는 종결 요청 단계로 돌아갑니다.' } : { title: r.error, variant: 'destructive' });
        });
      }}
    >
      확정 취소
    </Button>
  );
}
