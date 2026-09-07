'use client';

import { useState, useTransition } from 'react';
import { UserCog } from 'lucide-react';

import { decideMentorChangeAction } from '@/lib/workflow/mentee-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

/** 운영사: 멘티의 멘토 변경 요청 처리 — 수락 시 새 멘토를 골라 T3 교체 */
export function MentorChangePanel({ requests, mentors, currentMentorId }: { requests: { id: string; reason: string; created_at: string }[]; mentors: { id: string; name: string }[]; currentMentorId: string | null }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const [mentorId, setMentorId] = useState('');
  if (requests.length === 0) return null;

  const decide = (id: string, decision: 'accepted' | 'rejected') => {
    if (decision === 'accepted' && !mentorId) {
      toast({ title: '새 멘토를 선택하세요.', variant: 'destructive' });
      return;
    }
    if (decision === 'rejected' && !note.trim()) {
      toast({ title: '반려 사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    if (!confirm(decision === 'accepted' ? '요청을 수락하고 멘토를 교체할까요? 회차는 케이스 단위로 이어집니다.' : '요청을 반려할까요?')) return;
    start(async () => {
      const r = await decideMentorChangeAction(id, decision, note, decision === 'accepted' ? mentorId : undefined);
      toast(r.ok ? { title: decision === 'accepted' ? '수락 · 멘토 교체 완료' : '반려했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) {
        setNote('');
        setMentorId('');
      }
    });
  };

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCog className="h-4 w-4" /> 멘티의 멘토 변경 요청
        </CardTitle>
        <p className="text-xs text-muted-foreground">수락하면 현재 멘토 배정을 종료하고 새 멘토를 배정합니다(T3). 회차 수는 그대로 이어집니다.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {requests.map((r) => (
          <div key={r.id} className="rounded-lg border bg-amber-50/40 p-3">
            <p className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p>
            <p className="mt-1 whitespace-pre-wrap">{r.reason}</p>
            <div className="mt-3 flex flex-col gap-2">
              <select value={mentorId} onChange={(e) => setMentorId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" disabled={pending}>
                <option value="">새 멘토 선택 (수락 시)</option>
                {mentors
                  .filter((m) => m.id !== currentMentorId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="처리 메모 (반려 시 필수 · 멘티에게 전달)" disabled={pending} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(r.id, 'rejected')}>
                  반려
                </Button>
                <Button size="sm" disabled={pending} onClick={() => decide(r.id, 'accepted')}>
                  수락 · 멘토 교체
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
