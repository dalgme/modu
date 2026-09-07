'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { answerInquiryAction } from '@/lib/workflow/inquiry-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

/** 넥스트랩: 문의 답변 폼 */
export function InquiryAnswerForm({ id, initialAnswer }: { id: string; initialAnswer?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [answer, setAnswer] = useState(initialAnswer ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await answerInquiryAction({ id, answer });
    setSubmitting(false);
    if (result.ok) {
      toast({ title: '답변이 등록되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '답변 실패', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <Textarea
        rows={3}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="답변 내용을 입력하세요."
        required
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? '등록 중…' : initialAnswer ? '답변 수정' : '답변 등록'}
        </Button>
      </div>
    </form>
  );
}
