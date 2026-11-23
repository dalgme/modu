'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, PlusCircle, LogOut, UserRoundCog } from 'lucide-react';

import { requestClosureAction, requestExtensionAction, requestWithdrawalAction } from '@/lib/workflow/mentor-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { MentorRequestKind } from '@/lib/workflow/mentor-request-kind';
import { useToast } from '@/hooks/use-toast';

/** 멘토 요청 버튼: 종결 요청(T5) · 추가 회차 요청 · 멘토 변경 요청(T11a, 승인 → 재배정) · 중도 종결 요청(승인 → 검수) */
export function MentorRequests({
  caseId,
  canRequestClosure,
  closureHint,
  observationRequired = true,
  canRequestExtension,
  pendingExtension,
  canRequestWithdrawal,
  pendingWithdrawal,
  pendingWithdrawalKind = null,
}: {
  caseId: string;
  canRequestClosure: boolean;
  closureHint: string;
  /** false = 관찰의견서가 필요 없는 그룹(예: 1기 2라운드, 2026-10-15) — 버튼은 [종결 요청]만 */
  observationRequired?: boolean;
  canRequestExtension: boolean;
  pendingExtension: boolean;
  canRequestWithdrawal: boolean;
  pendingWithdrawal: boolean;
  /** 처리 대기 중인 요청 종류 (멘토 변경·중도 종결은 한 번에 하나) */
  pendingWithdrawalKind?: MentorRequestKind | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [panel, setPanel] = useState<null | 'extension' | 'reassign' | 'early_closure'>(null);
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
            // (2026-11-02) 관찰의견서 제출과 종결 요청은 분리 — 관찰의견서는 아래 관찰의견서 칸에서 올리고, 이 버튼은 종결 요청만
            if (!confirm(observationRequired ? '종결을 요청할까요? 올려 둔 회차 보고서와 관찰의견서로 운영사 검수가 진행되며, 요청 후에는 회차·관찰의견서를 수정할 수 없습니다.' : '종결을 요청할까요? 요청 후에는 회차를 수정할 수 없습니다.')) return;
            run(() => requestClosureAction(caseId), '종결을 요청했습니다. 운영사 검수 후 정산이 확정됩니다.');
          }}
          className="gap-1"
        >
          <CheckCircle2 className="h-4 w-4" /> 종결 요청
        </Button>
        <Button variant="outline" disabled={!canRequestExtension || pendingExtension || pending} onClick={() => setPanel(panel === 'extension' ? null : 'extension')} className="gap-1">
          <PlusCircle className="h-4 w-4" /> {pendingExtension ? '추가 회차 요청 대기 중' : '추가 회차 요청'}
        </Button>
        {/* (2026-11-17) 멘토 변경 요청(승인 → 재배정) · 중도 종결 요청(승인 → 검수). 둘 중 하나만 처리 대기 가능 */}
        <Button
          variant="outline"
          disabled={!canRequestWithdrawal || pendingWithdrawal || pending}
          onClick={() => setPanel(panel === 'reassign' ? null : 'reassign')}
          className="gap-1 border-amber-400 font-semibold text-amber-800 hover:bg-amber-50 dark:text-amber-200"
        >
          <UserRoundCog className="h-4 w-4" /> {pendingWithdrawalKind === 'reassign' ? '멘토 변경 요청 대기 중' : '멘토 변경 요청'}
        </Button>
        <Button
          disabled={!canRequestWithdrawal || pendingWithdrawal || pending}
          onClick={() => setPanel(panel === 'early_closure' ? null : 'early_closure')}
          className="gap-1 bg-red-600 font-semibold text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500 disabled:bg-red-300 disabled:text-white dark:bg-red-700 dark:hover:bg-red-600"
        >
          <LogOut className="h-4 w-4" /> {pendingWithdrawalKind === 'early_closure' ? '중도 종결 요청 대기 중' : '중도 종결 요청'}
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
      {panel === 'reassign' && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-amber-400 p-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">멘토 변경 요청</p>
          <p className="text-xs text-muted-foreground">운영사가 승인하면 이 멘티 담당이 끝나고, 진행한 회차(보고서 등록 회차)는 바로 정산됩니다. 남은 회차는 운영사가 다른 멘토를 배정해 이어서 진행합니다.</p>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="멘토 변경이 필요한 사유 (운영사·발주처·멘티에게 공개)" />
          <div className="flex justify-end">
            <Button size="sm" disabled={pending} onClick={() => run(() => requestWithdrawalAction(caseId, reason, 'reassign'), '멘토 변경을 요청했습니다.')}>
              요청
            </Button>
          </div>
        </div>
      )}
      {panel === 'early_closure' && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-destructive/50 p-3">
          <p className="text-sm font-medium text-destructive">중도 종결 요청</p>
          <p className="text-xs text-muted-foreground">
            멘티와 협의해 남은 회차를 더 진행하지 않을 때 요청합니다. 운영사가 승인하면 지금까지 보고서를 올린 회차까지로 멘토링이 끝나고 [검수]로 넘어가 정산됩니다. 보고서를 아직 올리지 않은 회차는 먼저 올려 주세요(예정 회차는 승인 시 정리됩니다).
          </p>
          {observationRequired && (
            <p className="text-xs font-semibold text-red-700 dark:text-red-300">
              중도 종결도 관찰의견서는 필수입니다. 진행한 회차까지의 내용으로 관찰의견서 파일을 올려 주세요 — 관찰의견서가 있어야 운영사가 검수를 승인(정산 확정)할 수 있습니다.
            </p>
          )}
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="중도 종결 사유 (운영사·발주처·멘티에게 공개)" />
          <div className="flex justify-end">
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => requestWithdrawalAction(caseId, reason, 'early_closure'), '중도 종결을 요청했습니다.')}>
              요청
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
