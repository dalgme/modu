'use client';

import { useState, useTransition } from 'react';
import { Pencil, Save, X } from 'lucide-react';

import { updateBatchMetaAction } from '@/lib/settlement/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

/**
 * (P31) draft 품의 제목·메모 편집 — 품의 상세 상단(BatchDetail)에서 운영사 + 'settlement' 권한일 때 마운트.
 * props: batchId · title · note (현재값) · status (draft 가 아니면 렌더하지 않음) · canEdit (페이지가 hasCapability(ctx,'settlement') 로 계산, 기본 true)
 */
export function BatchMetaForm({ batchId, title, note, status, canEdit = true }: { batchId: string; title: string; note: string | null; status: string; canEdit?: boolean }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(title);
  const [n, setN] = useState(note ?? '');
  if (status !== 'draft' || !canEdit) return null;
  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" /> 제목·메모 수정
      </Button>
    );
  }
  return (
    <form
      className="flex w-full max-w-xl flex-col gap-2 rounded-lg border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!t.trim()) {
          toast({ title: '품의 제목을 입력하세요.', variant: 'destructive' });
          return;
        }
        start(async () => {
          const r = await updateBatchMetaAction(batchId, t, n);
          if (!r.ok) {
            toast({ title: r.error, variant: 'destructive' });
            return;
          }
          toast({ title: '품의 제목·메모를 저장했습니다.' });
          setOpen(false);
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        제목
        <Input value={t} onChange={(e) => setT(e.target.value)} maxLength={120} disabled={pending} className="text-sm" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        메모 (발주처에도 보입니다)
        <Textarea value={n} onChange={(e) => setN(e.target.value)} rows={2} disabled={pending} className="text-sm" />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-1" disabled={pending} onClick={() => { setT(title); setN(note ?? ''); setOpen(false); }}>
          <X className="h-3.5 w-3.5" /> 취소
        </Button>
        <Button type="submit" size="sm" className="gap-1" disabled={pending}>
          <Save className="h-3.5 w-3.5" /> 저장
        </Button>
      </div>
    </form>
  );
}
