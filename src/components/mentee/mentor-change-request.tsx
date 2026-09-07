'use client';

import { useState, useTransition } from 'react';
import { UserCog } from 'lucide-react';

import { requestMentorChangeAction } from '@/lib/workflow/mentee-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

/** 멘티 → 멘토 변경 요청 (진행 중 케이스, 대기 중 요청 1건) */
export function MentorChangeRequest({ caseId, mentorName, canRequest, pending: pendingReq, lastDecision }: { caseId: string; mentorName: string | null; canRequest: boolean; pending: { created_at: string; reason: string } | null; lastDecision: { status: string; handled_at: string | null; handling_note: string | null } | null }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const submit = () => {
    if (!reason.trim()) {
      toast({ title: '사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    if (!confirm('멘토 변경을 요청할까요? 운영사가 검토 후 처리합니다.')) return;
    start(async () => {
      const r = await requestMentorChangeAction(caseId, reason);
      toast(r.ok ? { title: '변경 요청을 보냈습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) {
        setOpen(false);
        setReason('');
      }
    });
  };

  return (
    <div className="rounded-xl border bg-background p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          담당 멘토: <b>{mentorName ?? '배정 예정'}</b>
        </p>
        {canRequest && !pendingReq && (
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpen(!open)} disabled={pending}>
            <UserCog className="h-4 w-4" /> 멘토 변경 요청
          </Button>
        )}
      </div>
      {pendingReq && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          멘토 변경 요청 처리 대기 중 ({formatDateTime(pendingReq.created_at)}) — {pendingReq.reason}
        </p>
      )}
      {!pendingReq && lastDecision && lastDecision.status !== 'pending' && (
        <p className="mt-2 text-xs text-muted-foreground">
          최근 변경 요청: {lastDecision.status === 'accepted' ? '수락' : '반려'} {lastDecision.handled_at ? `(${formatDateTime(lastDecision.handled_at)})` : ''}
          {lastDecision.handling_note ? ` — ${lastDecision.handling_note}` : ''}
        </p>
      )}
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="변경을 원하는 이유를 적어 주세요 (운영사만 열람)" disabled={pending} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button size="sm" onClick={submit} disabled={pending}>
              요청 보내기
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
