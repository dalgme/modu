'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Loader2 } from 'lucide-react';

import { submitApplicationAction } from '@/lib/workflow/application-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/** 신청서 송신하기 — 넥스트랩·진흥원에 접수 알림/문자 발송 + 검수 시작 */
export function SubmitApplicationButton({ caseId, label }: { caseId: string; label: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    const res = await submitApplicationAction(caseId);
    setBusy(false);
    if (res.ok) {
      toast({ title: '신청서를 송신했습니다.', description: '넥스트랩·진흥원 검수가 시작됩니다.' });
      router.refresh();
    } else {
      toast({ title: '송신 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Button type="button" onClick={onSubmit} disabled={busy} className="gap-2">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      {busy ? '송신 중…' : label}
    </Button>
  );
}
