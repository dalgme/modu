'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Inbox, ChevronDown, ArrowRight } from 'lucide-react';

import type { OperatorRequestListItem } from '@/lib/data/operator-requests';
import { markOperatorRequestReadAction } from '@/lib/workflow/operator-request-actions';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/**
 * 운영사 대시보드: 발주처 요청 리스트.
 * 읽지 않은 요청은 강조(테두리·NEW 배지) 표시하고, 펼쳐 읽으면 강조를 해제한다.
 */
export function OperatorRequestsPanel({ requests }: { requests: OperatorRequestListItem[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(item: OperatorRequestListItem) {
    const next = openId === item.id ? null : item.id;
    setOpenId(next);
    // 처음 펼칠 때 읽지 않은 요청이면 읽음 처리 (강조 해제)
    if (next === item.id && !item.read_at) {
      startTransition(async () => {
        await markOperatorRequestReadAction(item.id);
        router.refresh();
      });
    }
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        접수된 운영사 요청이 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {requests.map((r) => {
        const unread = !r.read_at;
        const isOpen = openId === r.id;
        return (
          <div
            key={r.id}
            className={cn(
              'rounded-lg border bg-card transition-colors',
              unread
                ? 'border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/20'
                : 'hover:bg-accent/30',
            )}
          >
            <button
              type="button"
              onClick={() => toggle(r)}
              className="flex w-full items-center justify-between gap-3 p-3 text-left"
            >
              <span className="flex min-w-0 items-center gap-2">
                {unread && (
                  <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    NEW
                  </span>
                )}
                <span className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>
                  {r.title}
                </span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {r.businessName ? `· ${r.businessName}` : ''}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {formatDateTime(r.created_at)}
                <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
              </span>
            </button>
            {isOpen && (
              <div className="border-t px-3 py-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  {r.businessName ? `${r.businessName} · ` : ''}
                  {r.createdByName ? `요청자 ${r.createdByName}` : '발주처'}
                </p>
                <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                {r.case_id && (
                  <Link
                    href={`/nextlab/cases/${r.case_id}`}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    해당 케이스로 이동
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 대시보드 헤더용 라벨 (읽지 않은 수 강조) */
export function OperatorRequestsHeading({ unread }: { unread: number }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <Inbox className="h-5 w-5 text-primary" />
      운영사 요청
      {unread > 0 && (
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
          NEW {unread}
        </span>
      )}
    </h2>
  );
}
