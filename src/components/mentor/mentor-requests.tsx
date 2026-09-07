'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, PlusCircle, LogOut } from 'lucide-react';

import { requestClosureAction, requestExtensionAction, requestWithdrawalAction } from '@/lib/workflow/mentor-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

/** 멘토 요청 버튼 3종: 종결 요청(T5) · 추가 회차 요청 · 중도 종료 요청(T11a) */
export function MentorRequests({
  caseId,
  canRequestClosure,
  closureHint,
  canRequestExtension,
  pendingExtension,
  canRequestWithdrawal,
  pendingWithdrawal,
}: {
  caseId: string;
  canRequestClosure: boolean;
  closureHint: string;
  canRequestExtension: boolean;
  pendingExtension: boolean;
  canRequestWithdrawal: boolean;
  pendingWithdrawal: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [panel, setPanel] = useState<null | 'extension' | 'withdrawal'>(null);
  const [reason, setReason] = useState('');
  const [extra, setExtra] = useState(1);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
          toast({ title: r.error ?? '실패', variant: 'destructive' });
          return;
        }
      toast({ title: okMsg });
      setPanel(null);
      setReason('');
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canRequestClosure || pending}
          title={closureHint}
          onClick={() => {
            if (!confirm('관찰의견서를 제출하고 종결을 요청할까요? 요청 후에는 회차를 수정할 수 없습니다.')) return;
            run(() => requestClosureAction(caseId), '종결을 요청했습니다. 운영사 검수 후 정산이 확정됩니다.');
          }}
          className="gap-1"
        >
          <CheckCircle2 className="h-4 w-4" /> 관찰의견서 제출 · 종결 요청
        </Button>
        <Button variant="outline" disabled={!canRequestExtension || pendingExtension || pending} onClick={() => setPanel(panel === 'extension' ? null : 'extension')} className="gap-1">
          <PlusCircle className="h-4 w-4" /> {pendingExtension ? '추가 회차 요청 대기 중' : '추가 회차 요청'}
        </Button>
        <Button variant="outline" disabled={!canRequestWithdrawal || pendingWithdrawal || pending} onClick={() => setPanel(panel === 'withdrawal' ? null : 'withdrawal')} className="gap-1 text-destructive">
          <LogOut className="h-4 w-4" /> {pendingWithdrawal ? '중도 종료 요청 대기 중' : '중도 종료 요청'}
        </Button>
      </div>
      {!canRequestClosure && <p className="text-xs text-muted-foreground">{closureHint}</p>}

      {panel === 'extension' && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">추가 회차 요청 (운영사 승인 후 등록 가능)</p>
          <div className="flex items-center gap-2 text-sm">
            추가 <Input type="number" min={1} max={10} value={extra} onChange={(e) => setExtra(Number(e.target.value))} className="w-20" /> 회
          </div>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="추가 회차가 필요한 사유" />
          <div className="flex justify-end">
            <Button size="sm" disabled={pending} onClick={() => run(() => requestExtensionAction(caseId, reason, extra), '추가 회차를 요청했습니다.')}>
              요청
            </Button>
          </div>
        </div>
      )}
      {panel === 'withdrawal' && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-destructive/50 p-3">
          <p className="text-sm font-medium text-destructive">중도 종료 요청</p>
          <p className="text-xs text-muted-foreground">운영사가 승인하면 이 케이스 담당이 종료되고 이행한 회차는 정산됩니다. 잔여 회차는 다른 멘토가 진행합니다.</p>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="중도 종료 사유 (운영사·발주처·멘티에게 공개)" />
          <div className="flex justify-end">
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => requestWithdrawalAction(caseId, reason), '중도 종료를 요청했습니다.')}>
              요청
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
