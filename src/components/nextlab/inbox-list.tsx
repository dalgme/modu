'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import type { InboxItem } from '@/lib/data/requests';
import { decideExtensionAction, decideMentorWithdrawalAction } from '@/lib/settlement/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

const KIND_LABEL: Record<InboxItem['kind'], string> = { extension: '추가 회차 요청', mentor_change: '멘토 변경 요청(멘티)', mentor_withdrawal: '멘토 중도 종료 요청' };
const STATUS_LABEL: Record<string, string> = { pending: '대기', approved: '승인', rejected: '반려', accepted: '수락' };

/** 요청함 — 추가 회차·중도 종료는 여기서 바로 처리, 멘토 변경 요청은 새 멘토 선택이 필요해 케이스 상세로 */
export function InboxList({ items }: { items: InboxItem[] }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const decide = (it: InboxItem, decision: 'approved' | 'rejected') => {
    const note = notes[it.id] ?? '';
    if (decision === 'rejected' && !note.trim()) {
      toast({ title: '반려 사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    if (!confirm(decision === 'approved' ? (it.kind === 'mentor_withdrawal' ? '중도 종료를 승인할까요? 이행 회차는 부분 정산되고 케이스는 재배정 대기가 됩니다.' : `추가 ${it.extraRounds}회를 승인할까요?`) : '반려할까요?')) return;
    start(async () => {
      const r = it.kind === 'extension' ? await decideExtensionAction(it.id, decision, note) : await decideMentorWithdrawalAction(it.id, decision, note);
      toast(r.ok ? { title: decision === 'approved' ? '승인했습니다.' : '반려했습니다.' } : { title: r.error, variant: 'destructive' });
    });
  };

  if (items.length === 0) return <p className="rounded-xl border bg-background p-6 text-center text-sm text-muted-foreground">처리할 요청이 없습니다.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it) => (
        <li key={it.id} className={`rounded-xl border bg-background p-4 ${it.status === 'pending' ? 'border-amber-300' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <b>{KIND_LABEL[it.kind]}</b>
              {it.extraRounds ? ` +${it.extraRounds}회` : ''} ·{' '}
              <Link href={`/nextlab/cases/${it.caseId}`} className="text-primary hover:underline">
                {it.businessName} ({it.ownerName})
              </Link>{' '}
              · {it.supportTypeName ?? '-'} · 요청자 {it.requesterName}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(it.createdAt)} · <span className={it.status === 'pending' ? 'font-semibold text-amber-700' : ''}>{STATUS_LABEL[it.status] ?? it.status}</span>
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{it.reason}</p>
          {it.status !== 'pending' && it.decisionNote && <p className="mt-1 text-xs text-muted-foreground">처리 메모: {it.decisionNote}</p>}
          {it.status === 'pending' && it.kind === 'mentor_change' && (
            <div className="mt-2 flex justify-end">
              <Button asChild size="sm" variant="outline">
                <Link href={`/nextlab/cases/${it.caseId}`}>케이스 상세에서 새 멘토 지정 · 처리</Link>
              </Button>
            </div>
          )}
          {it.status === 'pending' && it.kind !== 'mentor_change' && (
            <div className="mt-2 flex flex-col gap-2">
              <Textarea rows={2} value={notes[it.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [it.id]: e.target.value }))} placeholder="처리 메모 (반려 시 필수 · 요청자에게 전달)" disabled={pending} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(it, 'rejected')}>반려</Button>
                <Button size="sm" disabled={pending} onClick={() => decide(it, 'approved')}>{it.kind === 'mentor_withdrawal' ? '승인 · 부분 정산' : '승인'}</Button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
