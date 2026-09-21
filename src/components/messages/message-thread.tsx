'use client';

import { useRef, useState, useTransition } from 'react';
import { Send } from 'lucide-react';

import type { MessageItem } from '@/lib/messages/data';
import { sendCaseMessageAction } from '@/lib/messages/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils/format';

/**
 * 담당 멘토 ↔ 멘티 메시지 스레드 (말풍선). viewerId 기준 좌/우 정렬.
 * readOnly = 운영사 모니터링 열람.
 */
export function MessageThread({
  caseId,
  viewerId,
  messages,
  counterpartLabel,
  readOnly = false,
}: {
  caseId: string;
  viewerId: string;
  messages: Pick<MessageItem, 'id' | 'sender_id' | 'body' | 'created_at' | 'read_at' | 'senderName' | 'senderRole'>[];
  counterpartLabel: string;
  readOnly?: boolean;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [text, setText] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  const send = () => {
    if (!text.trim()) return;
    start(async () => {
      const r = await sendCaseMessageAction(caseId, text);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      setText('');
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div ref={boxRef} className="flex max-h-[420px] flex-col gap-2 overflow-y-auto rounded-xl border bg-muted/20 p-3">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">아직 주고받은 메시지가 없습니다. 첫 메시지를 보내 보세요.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === viewerId;
          return (
            <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm',
                  mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border bg-background',
                )}
              >
                {m.body}
              </div>
              <span className="mt-0.5 text-[10px] text-muted-foreground">
                {m.senderName} · {formatDateTime(m.created_at)}
                {mine && (m.read_at ? ' · 읽음' : ' · 미확인')}
              </span>
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder={`${counterpartLabel}에게 메시지 보내기`}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            disabled={pending}
          />
          <Button onClick={send} disabled={pending || !text.trim()} className="gap-1">
            <Send className="h-4 w-4" /> {pending ? '전송 중…' : '보내기'}
          </Button>
        </div>
      )}
    </div>
  );
}
