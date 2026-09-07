'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

import { cancelScheduledSmsAction } from '@/lib/notifications/sms-admin-actions';
import type { ScheduledMessageRow } from '@/lib/data/scheduled-messages';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '예약 대기', cls: 'bg-status-progress/10 text-status-progress' },
  sent: { label: '발송됨', cls: 'bg-status-approved/10 text-status-approved' },
  canceled: { label: '취소됨', cls: 'bg-muted text-muted-foreground' },
  failed: { label: '실패', cls: 'bg-status-rejected/10 text-status-rejected' },
};

function fmt(iso: string): string {
  return iso ? iso.replace('T', ' ').slice(0, 16) : '-';
}

/** 예약 문자 목록 + 취소 (예약 대기 건만 취소 가능) */
export function ScheduledMessagesList({ items }: { items: ScheduledMessageRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function cancel(id: string) {
    setBusyId(id);
    const r = await cancelScheduledSmsAction(id);
    setBusyId(null);
    if (r.ok) {
      toast({ title: '예약을 취소했습니다.' });
      router.refresh();
    } else {
      toast({ title: '취소 실패', description: r.error, variant: 'destructive' });
    }
  }

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">예약된 발송이 없습니다.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">예약 일시</th>
            <th className="px-3 py-2 font-medium">문자내용</th>
            <th className="px-3 py-2 text-center font-medium">인원</th>
            <th className="px-3 py-2 font-medium">상태</th>
            <th className="px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => {
            const meta = STATUS_META[m.status] ?? STATUS_META.pending!;
            return (
              <tr key={m.id} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                  {fmt(m.scheduledAt)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  <span className="line-clamp-2">{m.text}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-center">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {m.recipientCount}명
                  </span>
                  {m.status === 'sent' && (m.sentCount > 0 || m.failedCount > 0) && (
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      (성공 {m.sentCount}
                      {m.failedCount ? ` · 실패 ${m.failedCount}` : ''})
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', meta.cls)}>
                    {meta.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {m.status === 'pending' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 text-status-rejected hover:bg-status-rejected/10"
                      disabled={busyId === m.id}
                      onClick={() => cancel(m.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                      {busyId === m.id ? '취소 중…' : '취소'}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
