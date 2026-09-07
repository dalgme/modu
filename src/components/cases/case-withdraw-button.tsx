'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, XCircle } from 'lucide-react';

import { withdrawCaseAction } from '@/lib/workflow/case-lifecycle-actions';
import type { CaseStatus } from '@/types/case-status';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/**
 * 대시보드 케이스 행의 '종료/포기' 버튼 (넥스트랩·진흥원 공용).
 * 처리 시 케이스를 종결하고 멘토 배정을 이력만 남긴 채 해제 → 자동 발송 문자 등에서 제외된다.
 */
export function CaseWithdrawButton({ caseId, status }: { caseId: string; status: CaseStatus }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  // 이미 종결(포기/지급완료)이면 버튼 대신 '—'
  if (status === 'withdrawn' || status === 'payment_approved') {
    return <span className="text-xs text-muted-foreground/60">—</span>;
  }

  async function run() {
    const reason = window.prompt(
      '종료/포기 사유를 입력하세요. (필수)\n멘토 배정은 이력만 남고, 자동 발송 문자 등 연동 기능에서 제외됩니다.',
    );
    if (reason === null) return;
    if (!reason.trim()) {
      toast({ title: '사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const res = await withdrawCaseAction(caseId, reason.trim());
    setBusy(false);
    if (res.ok) {
      toast({ title: '종료/포기 처리되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '처리 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={run}
      className="h-7 gap-1 whitespace-nowrap border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/10"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
      종료/포기
    </Button>
  );
}
