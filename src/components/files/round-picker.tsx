'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Layers } from 'lucide-react';

import { switchScopeAction } from '@/lib/programs/scope-actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * 라운드 선택 안내 (2026-09-30) — 파일 관리는 라운드(사업그룹) 단위라 범위가 "행사 전체"면 먼저 라운드를 고르게 한다.
 * 버튼을 누르면 상단 범위 스위처와 같은 액션으로 범위를 바꾼다(허브 왕복 없음).
 */
export function RoundPicker({ groups }: { groups: { id: string; code: string; name: string; caseCount: number; ended: boolean }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const pick = (id: string) =>
    start(async () => {
      const r = await switchScopeAction(id);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/60 p-5 dark:border-sky-800 dark:bg-sky-950/30">
      <p className="flex items-center gap-2 text-base font-bold text-sky-950 dark:text-sky-100">
        <Layers className="h-5 w-5" /> 먼저 라운드(사업그룹)를 선택하세요
      </p>
      <p className="text-sm text-sky-950/80 dark:text-sky-100/80">
        파일은 라운드별로 올립니다. 아래에서 라운드를 고르면 상단 범위가 그 라운드로 바뀝니다. (멘토 지급서류는 한 번 올리면 모든 라운드에서 함께 보입니다.)
      </p>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">사업그룹이 없습니다. 운영 설정 › 사업그룹에서 먼저 만드세요.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              disabled={pending}
              onClick={() => pick(g.id)}
              className={cn('inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold shadow-sm hover:border-primary hover:bg-accent disabled:opacity-60', g.ended && 'opacity-70')}
            >
              <span>{g.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">멘티 {g.caseCount}</span>
              {g.ended && <span className="text-[11px] text-muted-foreground">(종료)</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
