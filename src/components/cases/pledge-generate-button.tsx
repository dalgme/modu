'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PenLine } from 'lucide-react';

import { generateAttachmentFormAction } from '@/lib/workflow/attachment-forms-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * 사업참여 및 중복지원 금지 확약서(붙임6) '웹에서 작성(생성)' 버튼.
 * 케이스 업체정보를 채워 확약서 PDF 를 자동 생성한다(멘티 서명 필요).
 */
export function PledgeGenerateButton({ caseId, done = false }: { caseId: string; done?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const res = await generateAttachmentFormAction(caseId, 'pledge_no_overlap');
    setBusy(false);
    if (res.ok) {
      toast({ title: '확약서가 생성되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '생성 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={done ? 'default' : 'outline'}
      disabled={busy}
      onClick={run}
      className={cn('gap-1.5', done && 'bg-status-approved text-white hover:bg-status-approved/90')}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
      {done ? '확약서 다시 생성' : '웹에서 작성(생성)'}
    </Button>
  );
}
