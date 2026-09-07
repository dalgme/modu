'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Ban, UserX } from 'lucide-react';

import { decideMentorWithdrawalAction, forceEndMentorAction, withdrawCaseAction } from '@/lib/settlement/actions';
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
 * 케이스 종료 계열 — T10 멘티 중도 종료 / T11a 멘토 중도 종료 요청 승인·반려 / T11b 운영사 강제 종료.
 * 버튼 노출 조건은 서버 페이지가 canTransition 으로 계산해 내려준다.
 */
export function CaseEndPanel({
  caseId,
  pendingWithdrawals,
  canDecideWithdrawal,
  canForceEnd,
  canWithdrawCase,
  hasActiveMentor,
}: {
  caseId: string;
  pendingWithdrawals: PendingWithdrawalRequest[];
  canDecideWithdrawal: boolean;
  canForceEnd: boolean;
  canWithdrawCase: boolean;
  hasActiveMentor: boolean;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'none' | 'force' | 'withdraw'>('none');

  const decide = (id: string, decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !note.trim()) {
      toast({ title: '반려 사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    if (!confirm(decision === 'approved' ? '중도 종료를 승인할까요? 이 멘토의 이행 회차는 부분 정산으로 확정되고 케이스는 재배정 대기가 됩니다.' : '요청을 반려할까요?')) return;
    start(async () => {
      const r = await decideMentorWithdrawalAction(id, decision, note);
      toast(r.ok ? { title: decision === 'approved' ? '승인 · 부분 정산 확정 · 재배정 대기' : '반려했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) setNote('');
    });
  };

  const submitMode = () => {
    if (!note.trim()) {
      toast({ title: '사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    const msg = mode === 'force' ? '멘토를 강제 종료할까요? 사유는 운영사·발주처만 열람하며, 이행 회차는 부분 정산됩니다.' : '멘티를 중도 종료할까요? 되돌릴 수 없으며 이행 회차는 부분 정산됩니다.';
    if (!confirm(msg)) return;
    start(async () => {
      const r = mode === 'force' ? await forceEndMentorAction(caseId, note) : await withdrawCaseAction(caseId, note);
      toast(r.ok ? { title: mode === 'force' ? '멘토를 종료했습니다. 재배정 대기.' : '중도 종료했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) {
        setNote('');
        setMode('none');
      }
    });
  };

  if (!canDecideWithdrawal && !canForceEnd && !canWithdrawCase) return null;

  return (
    <Card className={pendingWithdrawals.length > 0 ? 'border-amber-300' : undefined}>
      <CardHeader>
        <CardTitle className="text-base">중도 종료 처리</CardTitle>
        <p className="text-xs text-muted-foreground">이행 회차는 종료 시점에 부분 정산(케이스 × 멘토)으로 확정됩니다. 회차가 없으면 정산 행을 만들지 않습니다.</p>
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
                <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(r.id, 'rejected')}>
                  반려
                </Button>
                <Button size="sm" disabled={pending} onClick={() => decide(r.id, 'approved')}>
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
        </div>
        {(mode !== 'none' || (canDecideWithdrawal && pendingWithdrawals.length > 0)) && (
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            disabled={pending}
            placeholder={mode === 'force' ? '강제 종료 사유 (운영사·발주처만 열람 — 멘토·멘티에게는 "운영사 결정으로 종료" 로만 표시)' : mode === 'withdraw' ? '멘티 중도 종료 사유' : '승인·반려 메모 (반려 시 필수)'}
          />
        )}
        {mode !== 'none' && (
          <div className="flex justify-end">
            <Button size="sm" variant={mode === 'withdraw' ? 'destructive' : 'default'} disabled={pending} onClick={submitMode}>
              {mode === 'force' ? '강제 종료 확정' : '중도 종료 확정'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
