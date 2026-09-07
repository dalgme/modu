'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, X, Check, Eye, EyeOff } from 'lucide-react';

import {
  createFaqAction,
  updateFaqAction,
  deleteFaqAction,
} from '@/lib/workflow/faq-actions';
import type { FaqRow } from '@/lib/data/faqs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function Editor({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: FaqRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 0));
  const [isPublished, setIsPublished] = useState(initial?.is_published ?? true);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const payload = {
      question,
      answer,
      sortOrder: Number(sortOrder) || 0,
      isPublished,
    };
    const result = initial
      ? await updateFaqAction({ id: initial.id, ...payload })
      : await createFaqAction(payload);
    setBusy(false);
    if (result.ok) {
      toast({ title: initial ? 'FAQ를 수정했습니다.' : 'FAQ를 추가했습니다.' });
      onSaved();
    } else {
      toast({ title: '저장 실패', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">질문</Label>
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">답변</Label>
        <Textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">정렬 순서</Label>
          <Input
            type="number"
            className="w-24"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
          />
          게시(멘토에게 노출)
        </label>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            <X className="h-4 w-4" />
            취소
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={busy}>
            <Check className="h-4 w-4" />
            {busy ? '저장 중…' : '저장'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FaqManager({ faqs }: { faqs: FaqRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function refresh() {
    setEditingId(null);
    setAdding(false);
    router.refresh();
  }

  async function onDelete(id: string) {
    if (!window.confirm('이 FAQ를 삭제할까요?')) return;
    setDeletingId(id);
    const result = await deleteFaqAction(id);
    setDeletingId(null);
    if (result.ok) {
      toast({ title: 'FAQ를 삭제했습니다.' });
      router.refresh();
    } else {
      toast({ title: '삭제 실패', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!adding ? (
        <div>
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            FAQ 추가
          </Button>
        </div>
      ) : (
        <Editor onCancel={() => setAdding(false)} onSaved={refresh} />
      )}

      {faqs.length === 0 && !adding ? (
        <p className="py-4 text-center text-sm text-muted-foreground">등록된 FAQ가 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {faqs.map((f) =>
            editingId === f.id ? (
              <li key={f.id}>
                <Editor initial={f} onCancel={() => setEditingId(null)} onSaved={refresh} />
              </li>
            ) : (
              <li key={f.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {f.sort_order}
                      </span>
                      {f.question}
                      <span
                        className={cn(
                          'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          f.is_published
                            ? 'bg-status-approved/10 text-status-approved'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {f.is_published ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                        {f.is_published ? '게시' : '숨김'}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {f.answer}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(f.id)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-accent"
                      aria-label="수정"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(f.id)}
                      disabled={deletingId === f.id}
                      className="rounded p-1.5 text-muted-foreground hover:bg-status-rejected/10 hover:text-status-rejected"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
