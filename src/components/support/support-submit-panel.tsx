'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Send } from 'lucide-react';

import {
  submitPreSupportAction,
  submitPostSupportAction,
} from '@/lib/workflow/support-items-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils/format';

/**
 * 지원신청(사전)/자금신청(사후) 업로드 페이지 상단 패널.
 * - 제출 진행률(n/N) + 부족 서류 목록(강조) → "지금 뭐가 부족한지" 한눈에
 * - 모든 필수서류 충족 시 [제출하기] 활성화 → 제출 완료 배지
 */
export function SupportSubmitPanel({
  caseId,
  phase,
  requiredTotal,
  presentTotal,
  missing,
  submittedAt,
  complete,
  editable,
}: {
  caseId: string;
  phase: 'pre' | 'post';
  requiredTotal: number;
  presentTotal: number;
  missing: string[];
  submittedAt: string | null;
  complete: boolean;
  editable: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const label = phase === 'pre' ? '지원신청(사전) 서류' : '자금신청(사후) 증빙';

  async function onSubmit() {
    setBusy(true);
    const res =
      phase === 'pre' ? await submitPreSupportAction(caseId) : await submitPostSupportAction(caseId);
    setBusy(false);
    if (res.ok) {
      toast({ title: '제출이 완료되었습니다.', description: '운영팀·멘토가 확인 후 다음 단계를 진행합니다.' });
      router.refresh();
    } else {
      toast({ title: '제출할 수 없습니다', description: res.error, variant: 'destructive' });
    }
  }

  const pct = requiredTotal > 0 ? Math.round((presentTotal / requiredTotal) * 100) : 0;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4',
        submittedAt
          ? 'border-status-approved/40 bg-status-approved/5'
          : complete
            ? 'border-status-progress/40 bg-status-progress/5'
            : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {submittedAt ? (
            <CheckCircle2 className="h-5 w-5 text-status-approved" />
          ) : complete ? (
            <CheckCircle2 className="h-5 w-5 text-status-progress" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          )}
          <span className="font-semibold">
            {submittedAt
              ? `${label} 제출 완료`
              : complete
                ? '모든 필수서류가 준비되었습니다'
                : '아직 부족한 서류가 있습니다'}
          </span>
        </div>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">
          {presentTotal}/{requiredTotal} 완료
        </span>
      </div>

      {/* 진행률 바 */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            complete ? 'bg-status-approved' : 'bg-amber-500',
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {submittedAt && (
        <p className="text-xs text-status-approved">
          {formatDate(submittedAt)} 제출됨 · 서류를 수정하면 다시 [제출하기]를 눌러 주세요.
        </p>
      )}

      {/* 부족 서류 목록 */}
      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-background/60 p-3 dark:border-amber-900">
          <p className="mb-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
            지금 올려야 할 서류 ({missing.length})
          </p>
          <ul className="flex flex-col gap-0.5 text-sm">
            {missing.map((m, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {editable && (
        <div>
          <Button type="button" onClick={onSubmit} disabled={busy || !complete} className="gap-1.5">
            <Send className="h-4 w-4" />
            {busy ? '제출 중…' : submittedAt ? '다시 제출하기' : '제출하기'}
          </Button>
          {!complete && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              필수서류를 모두 올리면 제출할 수 있습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
