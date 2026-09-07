'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Check } from 'lucide-react';

import { resolveSupplementRequestAction } from '@/lib/workflow/supplement-actions';
import type { SupplementRequestItem } from '@/lib/data/supplement-requests';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';

const PHASE = {
  pre: { label: '지원신청(사전)', href: '/mentee/pre-support' },
  post: { label: '자금신청(사후)', href: '/mentee/post-support' },
  general: { label: '서류', href: '/mentee/pre-support' },
} as const;

/**
 * 멘티 대시보드 상단 '보완 요청' 알림.
 * 운영/멘토가 보낸 미처리 보완 요청을 눈에 띄게 노출하고, 보완 후 '처리 완료'로 닫는다.
 */
export function MenteeSupplementAlerts({ requests }: { requests: SupplementRequestItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (requests.length === 0) return null;

  async function resolve(id: string) {
    setBusyId(id);
    const res = await resolveSupplementRequestAction(id);
    setBusyId(null);
    if (res.ok) {
      toast({ title: '처리 완료로 표시했습니다.' });
      router.refresh();
    } else {
      toast({ title: '처리 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-rose-300 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/30">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
        <h2 className="text-base font-bold text-rose-700 dark:text-rose-300">
          서류 보완 요청 {requests.length}건
        </h2>
      </div>
      <p className="text-sm text-rose-700/80 dark:text-rose-300/80">
        운영팀·멘토가 보완을 요청했습니다. 아래 내용을 확인하고 해당 화면에서 서류를 다시 올린 뒤,
        <b> 처리 완료</b>를 눌러 주세요.
      </p>
      <ul className="flex flex-col gap-2">
        {requests.map((r) => {
          const meta = PHASE[r.phase];
          return (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-background p-3 dark:border-rose-900 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <span className="mr-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-900 dark:text-rose-200">
                  {meta.label}
                </span>
                <span className="text-sm">{r.message}</span>
                <span className="ml-1 text-[11px] text-muted-foreground">· {formatDate(r.createdAt)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button asChild size="sm" variant="outline" className="gap-1">
                  <Link href={meta.href}>
                    서류 올리러 가기
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1"
                  disabled={busyId === r.id}
                  onClick={() => resolve(r.id)}
                >
                  <Check className="h-3.5 w-3.5" />
                  {busyId === r.id ? '처리 중…' : '처리 완료'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
