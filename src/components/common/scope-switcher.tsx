'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Layers } from 'lucide-react';

import { switchScopeAction } from '@/lib/programs/scope-actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export interface ScopeGroupOption {
  id: string;
  code: string;
  name: string;
  caseCount: number;
  ended?: boolean;
}

/**
 * 범위 스위처 (P25) — 운영사·발주처 화면 상단에 상시 노출.
 * "행사 전체"와 사업그룹(라운드)을 한 번의 클릭으로 오가며, 아래 모든 명단·매칭·정산·조사·설정이 이 범위로 필터된다.
 */
export function ScopeSwitcher({ groups, currentGroupId }: { groups: ScopeGroupOption[]; currentGroupId: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const go = (groupId: string | null) => {
    if (groupId === currentGroupId) return;
    start(async () => {
      const r = await switchScopeAction(groupId);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      router.refresh();
    });
  };

  const pill = (active: boolean, disabled: boolean) =>
    cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
      active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
      disabled && 'opacity-60',
    );

  return (
    <div className="border-b bg-muted/40">
      <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4 py-1.5">
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <Layers className="h-3.5 w-3.5" /> 범위
        </span>
        <button type="button" disabled={pending} onClick={() => go(null)} className={pill(currentGroupId === null, pending)} title="행사 안 모든 그룹을 한 번에 봅니다">
          행사 전체
        </button>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            disabled={pending}
            onClick={() => go(g.id)}
            className={pill(currentGroupId === g.id, pending)}
            title={`${g.code} · ${g.name}${g.ended ? ' (종료)' : ''}`}
          >
            <span>{g.name}</span>
            <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', currentGroupId === g.id ? 'bg-primary-foreground/20' : 'bg-muted')}>{g.caseCount}</span>
          </button>
        ))}
        {groups.length === 0 && <span className="text-xs text-muted-foreground">사업그룹이 아직 없습니다 — 운영 설정에서 개설하세요.</span>}
      </div>
    </div>
  );
}
