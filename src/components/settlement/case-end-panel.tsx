'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { AlertTriangle, Ban, RotateCcw, UserX } from 'lucide-react';

import { decideMentorWithdrawalAction, forceEndMentorAction, withdrawCaseAction } from '@/lib/settlement/actions';
import { reinstateCaseAction } from '@/lib/workflow/reinstate-actions';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

export interface PendingWithdrawalRequest {
  id: string;
  reason: string;
  created_at: string;
}

/**
 * 케이스 종료 계열 — T10 멘티 중도 종료 / T11a 멘토 중도 종료 요청 승인·반려 / T11b 운영사 강제 종료 / T13 복귀.
 * 버튼 노출 조건은 서버 페이지가 canTransition(발주처는 canWithdrawAs) 으로 계산해 내려준다.
 * (P31) 확인은 공용 ConfirmDialog — 영향 목록 + 사유 입력(다이얼로그 안 textarea 가 최종 사유).
 */
export function CaseEndPanel({
  caseId,
  pendingWithdrawals,
  canDecideWithdrawal,
  canForceEnd,
  canWithdrawCase,
  hasActiveMentor,
  canReinstate = false,
  withdrawnReason = null,
  unsettledRounds,
}: {
  caseId: string;
  pendingWithdrawals: PendingWithdrawalRequest[];
  canDecideWithdrawal: boolean;
  canForceEnd: boolean;
  canWithdrawCase: boolean;
  hasActiveMentor: boolean;
  /** T13 중도 종료 복귀 (P30) — 페이지가 canTransition('reinstate_case', status) && 운영사 PL 로 계산해 내려준다 */
  canReinstate?: boolean;
  withdrawnReason?: string | null;
  /** 부분 정산 대상(미정산 이행) 회차 수 — 영향 목록 표시용(선택) */
  unsettledRounds?: number;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'none' | 'force' | 'withdraw' | 'reinstate'>('none');
  const [highlight, setHighlight] = useState(false);
  const { confirm, dialog } = useConfirm();
  const reasonRef = useRef('');

  // 배정 관리 ③ 카드(멘토 배정 패널)에서 진입 — 강제 종료 폼을 열고 잠시 강조한다 (P22)
  useEffect(() => {
    const open = () => {
      if (canForceEnd) setMode('force');
      setHighlight(true);
      window.setTimeout(() => setHighlight(false), 2500);
    };
    window.addEventListener('modu:open-force-end', open);
    return () => window.removeEventListener('modu:open-force-end', open);
  }, [canForceEnd]);

  const settleLine = unsettledRounds !== undefined ? `이행 회차 ${unsettledRounds}건이 부분 정산(케이스 × 멘토)으로 확정됩니다.` : '이행(보고서 등록) 회차는 부분 정산으로 확정됩니다(0건이면 정산 행 없음).';

  const reasonBox = (placeholder: string, required: boolean) => (
    <Textarea autoFocus rows={3} defaultValue={note} placeholder={`${placeholder}${required ? ' (필수)' : ''}`} onChange={(e) => { reasonRef.current = e.target.value; }} />
  );

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    reasonRef.current = note;
    const ok = await confirm(
      decision === 'approved'
        ? { title: '멘토 중도 종료 승인', description: '멘토의 중도 종료 요청을 승인합니다.', impact: [settleLine, '케이스는 재배정 대기가 되고 새 멘토를 배정하면 잔여 회차를 이어갑니다.', '이 멘토의 계획(미보고) 회차는 정리됩니다.'], confirmLabel: '승인 · 부분 정산', severity: 'danger', children: reasonBox('승인 메모', false) }
        : { title: '요청 반려', description: '멘토의 중도 종료 요청을 반려합니다. 멘토는 계속 담당합니다.', confirmLabel: '반려', children: reasonBox('반려 사유', true) },
    );
    if (!ok) return;
    const reason = reasonRef.current.trim();
    if (decision === 'rejected' && !reason) {
      toast({ title: '반려 사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    start(async () => {
      const r = await decideMentorWithdrawalAction(id, decision, reason);
      toast(r.ok ? { title: decision === 'approved' ? '승인 · 부분 정산 확정 · 재배정 대기' : '반려했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) setNote('');
    });
  };

  const submitMode = async () => {
    reasonRef.current = note;
    const opts =
      mode === 'force'
        ? { title: '멘토 강제 종료', description: '활성 멘토를 운영사 결정으로 종료합니다. 사유는 운영사·발주처만 열람하며 멘토·멘티에게는 "운영사 결정으로 종료"로만 표시됩니다.', impact: [settleLine, '케이스는 재배정 대기가 됩니다.', '이 멘토의 계획(미보고) 회차는 정리됩니다.'], confirmLabel: '강제 종료 확정', severity: 'danger' as const, children: reasonBox('강제 종료 사유', true) }
        : mode === 'reinstate'
          ? { title: '중도 종료 복귀', description: '중도 종료를 취소하고 재배정 대기로 복귀시킵니다.', impact: ['이미 확정된 부분 정산은 유지됩니다.', '새 멘토를 배정하면 잔여 회차를 이어갑니다.', '품의 편성·확인된 정산이 있으면 복귀할 수 없습니다.'], confirmLabel: '복귀 확정', severity: 'normal' as const, children: reasonBox('복귀 사유', true) }
          : { title: '멘티 중도 종료', description: '이 멘티(케이스)를 중도 종료합니다.', impact: [settleLine, '멘토·멘티에게 종료 알림이 발송됩니다.', '복귀는 메인 담당자(PL)가 정산 품의 전까지 할 수 있습니다.'], confirmLabel: '중도 종료 확정', severity: 'danger' as const, children: reasonBox('멘티 중도 종료 사유', true) };
    const ok = await confirm(opts);
    if (!ok) return;
    const reason = reasonRef.current.trim();
    if (!reason) {
      toast({ title: '사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    start(async () => {
      const r = mode === 'force' ? await forceEndMentorAction(caseId, reason) : mode === 'reinstate' ? await reinstateCaseAction(caseId, reason) : await withdrawCaseAction(caseId, reason);
      toast(r.ok ? { title: mode === 'force' ? '멘토를 종료했습니다. 재배정 대기.' : mode === 'reinstate' ? '복귀했습니다. 재배정 대기 상태입니다.' : '중도 종료했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) {
        setNote('');
        setMode('none');
      }
    });
  };

  if (!canDecideWithdrawal && !canForceEnd && !canWithdrawCase && !canReinstate) return null;

  return (
    <Card
      id="case-end-panel"
      className={`${pendingWithdrawals.length > 0 ? 'border-amber-300 ' : ''}${highlight ? 'ring-2 ring-primary ring-offset-2 transition-shadow' : ''}` || undefined}
    >
      {dialog}
      <CardHeader>
        <CardTitle className="text-base">{canReinstate ? '중도 종료 복귀' : '중도 종료 처리'}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {canReinstate
            ? `중도 종료된 케이스입니다${withdrawnReason ? ` (사유: ${withdrawnReason})` : ''}. 복귀하면 재배정 대기로 돌아가며 이전 부분 정산은 유지됩니다. 품의 편성·확인된 정산이 있으면 복귀할 수 없습니다.`
            : '이행 회차는 종료 시점에 부분 정산(케이스 × 멘토)으로 확정됩니다. 회차가 없으면 정산 행을 만들지 않습니다.'}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {canDecideWithdrawal &&
          pendingWithdrawals.map((r) => (
            <div key={r.id} className="rounded-lg border border-amber-300 bg-amber-50/40 p-3">
              <p className="flex items-center gap-1 font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-600" /> 멘토 중도 종료 요청 · {formatDateTime(r.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{r.reason}</p>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => void decide(r.id, 'rejected')}>
                  반려
                </Button>
                <Button size="sm" disabled={pending} onClick={() => void decide(r.id, 'approved')}>
                  승인 · 부분 정산
                </Button>
              </div>
            </div>
          ))}

        <div className="flex flex-wrap gap-2">
          {canForceEnd && hasActiveMentor && (
            <Button size="sm" variant={mode === 'force' ? 'default' : 'outline'} className="gap-1" disabled={pending} onClick={() => setMode(mode === 'force' ? 'none' : 'force')}>
              <UserX className="h-4 w-4" /> 멘토 강제 종료
            </Button>
          )}
          {canWithdrawCase && (
            <Button size="sm" variant={mode === 'withdraw' ? 'destructive' : 'outline'} className="gap-1" disabled={pending} onClick={() => setMode(mode === 'withdraw' ? 'none' : 'withdraw')}>
              <Ban className="h-4 w-4" /> 멘티 중도 종료
            </Button>
          )}
          {canReinstate && (
            <Button size="sm" variant={mode === 'reinstate' ? 'default' : 'outline'} className="gap-1" disabled={pending} onClick={() => setMode(mode === 'reinstate' ? 'none' : 'reinstate')}>
              <RotateCcw className="h-4 w-4" /> 중도 종료 복귀 (재배정 대기)
            </Button>
          )}
        </div>
        {(mode !== 'none' || (canDecideWithdrawal && pendingWithdrawals.length > 0)) && (
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            disabled={pending}
            placeholder={mode === 'force' ? '강제 종료 사유 (운영사·발주처만 열람 — 멘토·멘티에게는 "운영사 결정으로 종료" 로만 표시)' : mode === 'withdraw' ? '멘티 중도 종료 사유' : mode === 'reinstate' ? '복귀 사유 (감사 로그에 남습니다)' : '승인·반려 메모 (반려 시 필수)'}
          />
        )}
        {mode !== 'none' && (
          <div className="flex justify-end">
            <Button size="sm" variant={mode === 'withdraw' ? 'destructive' : 'default'} disabled={pending} onClick={() => void submitMode()}>
              {mode === 'force' ? '강제 종료 확정' : mode === 'reinstate' ? '복귀 확정' : '중도 종료 확정'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
