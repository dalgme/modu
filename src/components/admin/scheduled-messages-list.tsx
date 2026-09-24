'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, X } from 'lucide-react';

import { cancelScheduledSmsAction } from '@/lib/notifications/sms-admin-actions';
import type { ScheduledMessageRow } from '@/lib/data/scheduled-messages';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '예약 대기', cls: 'bg-status-progress-bg text-status-progress' },
  sent: { label: '발송됨', cls: 'bg-status-approved-bg text-status-approved' },
  canceled: { label: '취소됨', cls: 'bg-muted text-muted-foreground' },
  failed: { label: '실패', cls: 'bg-status-rejected-bg text-status-rejected' },
};

/** 예약 문자 목록 + 취소 (예약 대기 건만 취소 가능). 시각은 KST 로 표시(formatDateTime). */
export function ScheduledMessagesList({ items, canCancel = true }: { items: ScheduledMessageRow[]; canCancel?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [target, setTarget] = useState<ScheduledMessageRow | null>(null);

  async function cancel(id: string) {
    setBusyId(id);
    const r = await cancelScheduledSmsAction(id);
    setBusyId(null);
    setTarget(null);
    if (r.ok) {
      toast({ title: '예약을 취소했습니다.' });
      router.refresh();
    } else {
      toast({ title: '취소 실패', description: r.error, variant: 'destructive' });
    }
  }

  if (items.length === 0) {
    return <EmptyState compact icon={CalendarClock} title="예약된 발송이 없습니다" hint="[문자 발송] 탭에서 발송 방식을 '예약 발송'으로 고르면 여기에 나타납니다." />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">예약 일시 (KST)</th>
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
                  {formatDateTime(m.scheduledAt)}
                  {m.dispatchedAt && <span className="block text-[11px]">발송 {formatDateTime(m.dispatchedAt)}</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  <span className="line-clamp-2" title={m.text}>{m.text}</span>
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
                  {m.status === 'pending' && canCancel && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 text-status-rejected hover:bg-status-rejected/10"
                      disabled={busyId === m.id}
                      onClick={() => setTarget(m)}
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

      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => {
          if (!o) setTarget(null);
        }}
        title="예약 발송 취소"
        description={target ? `${formatDateTime(target.scheduledAt)} 예약(${target.recipientCount}명)을 취소합니다. 취소 후에는 다시 예약해야 합니다.` : undefined}
        severity="danger"
        confirmLabel="예약 취소"
        cancelLabel="닫기"
        pending={!!busyId}
        onConfirm={() => {
          if (target) void cancel(target.id);
        }}
      >
        {target && (
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-sans text-xs leading-relaxed">{target.text}</pre>
        )}
      </ConfirmDialog>
    </div>
  );
}
