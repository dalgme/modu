'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { answerInquiryAction } from '@/lib/workflow/inquiry-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

/** 운영사: 문의 답변 폼. updatedAt = 렌더 시점 inquiries.updated_at (답변 수정 충돌 감지) */
export function InquiryAnswerForm({ id, initialAnswer, updatedAt, canAnswer = true }: { id: string; initialAnswer?: string; updatedAt?: string | null; canAnswer?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [answer, setAnswer] = useState(initialAnswer ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await answerInquiryAction({ id, answer, updatedAt: updatedAt ?? null });
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
        <Button type="submit" size="sm" disabled={submitting || !canAnswer} title={canAnswer ? undefined : '검수·요청 처리 권한(review)이 있는 담당자만 답변할 수 있습니다.'}>
          {submitting ? '등록 중…' : initialAnswer ? '답변 수정' : '답변 등록'}
        </Button>
      </div>
    </form>
  );
}
