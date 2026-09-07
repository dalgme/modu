'use client';

import { useTransition } from 'react';
import { X } from 'lucide-react';

import type { TagRow } from '@/lib/settings/data';
import { addTagAction, deleteTagAction } from '@/lib/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const CATS: { key: string; label: string }[] = [
  { key: 'need', label: '필요 분야' },
  { key: 'expertise', label: '멘토 전문분야' },
  { key: 'industry', label: '업종' },
  { key: 'stage', label: '창업 단계' },
  { key: 'region', label: '지역' },
  { key: 'custom', label: '기타' },
];

/** 키워드 사전 — AI 매칭 추천·프로필 자동완성용 */
export function TagsManager({ tags }: { tags: TagRow[] }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {CATS.map((c) => (
        <section key={c.key} className="rounded-xl border bg-background p-4">
          <h3 className="text-sm font-semibold">{c.label}</h3>
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.filter((t) => t.category === c.key).map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                {t.label}
                <button type="button" aria-label="삭제" disabled={pending} onClick={() => start(async () => { const r = await deleteTagAction(t.id); if (!r.ok) toast({ title: r.error, variant: 'destructive' }); })}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            action={(fd) =>
              start(async () => {
                const r = await addTagAction({ category: c.key, label: fd.get('label'), sort_order: tags.filter((t) => t.category === c.key).length + 1 });
                if (!r.ok) toast({ title: r.error, variant: 'destructive' });
              })
            }
          >
            <Input name="label" placeholder="키워드 추가" required className="h-8 text-sm" />
            <Button type="submit" size="sm" disabled={pending}>
              추가
            </Button>
          </form>
        </section>
      ))}
    </div>
  );
}
