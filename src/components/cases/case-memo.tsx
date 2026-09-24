'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { addCaseMemoAction } from '@/lib/workflow/case-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

/** 케이스 내부 메모 입력 (append-only, audit_logs action='case.memo'). 운영사 case.manage 권한 — 서버가 검사한다. */
export function CaseMemoForm({ caseId, canWrite }: { caseId: string; canWrite: boolean }) {
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  if (!canWrite) return <p className="text-xs text-muted-foreground">메모 작성은 멘티 등록·서류 권한(case.manage)이 있는 담당자만 할 수 있습니다.</p>;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const text = body.trim();
        if (!text) return;
        start(async () => {
          const r = await addCaseMemoAction(caseId, text);
          if (r.ok) {
            setBody('');
            toast({ title: '메모를 남겼습니다.' });
            router.refresh();
          } else toast({ title: r.error, variant: 'destructive' });
        });
      }}
    >
      <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="내부 메모 (운영사만 봅니다 · 수정·삭제 불가, 1,000자)" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{body.length}/1000</span>
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>{pending ? '저장 중…' : '메모 남기기'}</Button>
      </div>
    </form>
  );
}
