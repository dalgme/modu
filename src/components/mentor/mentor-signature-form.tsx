'use client';

import { useState, useTransition } from 'react';

import { saveMentorSignatureAction } from '@/lib/workflow/mentor-actions';
import { SignaturePad } from '@/components/common/signature-pad';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function MentorSignatureForm({ current }: { current: string | null }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [sig, setSig] = useState<string | null>(null);
  const [editing, setEditing] = useState(!current);
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-background p-4 shadow-sm">
      {current && (
        <div className="flex items-center gap-4">
          {/* 등록본 미리보기 — data:URI */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current} alt="등록된 서명" className="h-16 rounded border bg-white px-2" />
          <Button variant="outline" size="sm" onClick={() => setEditing(!editing)} disabled={pending}>
            {editing ? '교체 취소' : '서명 교체'}
          </Button>
        </div>
      )}
      {editing && (
        <>
          <SignaturePad label="서명 (직접 그리거나 이미지 업로드)" onChange={setSig} />
          <div className="flex justify-end">
            <Button
              disabled={pending || !sig}
              onClick={() =>
                start(async () => {
                  const r = await saveMentorSignatureAction(sig!);
                  toast(r.ok ? { title: '서명을 등록했습니다.' } : { title: r.error, variant: 'destructive' });
                  if (r.ok) setEditing(false);
                })
              }
            >
              {pending ? '저장 중…' : '서명 저장'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
