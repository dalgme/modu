'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquareText } from 'lucide-react';

import { remindSatisfactionAction } from '@/lib/surveys/campaign-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function SatisfactionRemindButton({ unresponded }: { unresponded: number }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      className="gap-1"
      disabled={pending || unresponded === 0}
      onClick={() => {
        if (!confirm(`만족도 미응답 멘티 ${unresponded}명에게 독려 문자를 발송할까요?`)) return;
        start(async () => {
          const r = await remindSatisfactionAction();
          if (!r.ok) {
            toast({ title: r.error, variant: 'destructive' });
            return;
          }
          toast({ title: `발송 ${r.sent}건 · 실패 ${r.failed}건 · 휴대폰 없음 ${r.skipped}건` });
          router.refresh();
        });
      }}
    >
      <MessageSquareText className="h-4 w-4" /> 미응답 {unresponded}명 독려 발송
    </Button>
  );
}
