'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Layers } from 'lucide-react';

import { switchScopeAction } from '@/lib/programs/scope-actions';
import { useToast } from '@/hooks/use-toast';
import { ScrollActiveTab } from '@/components/common/scroll-active-tab';
import { cn } from '@/lib/utils';

export interface ScopeGroupOption {
  id: string;
  code: string;
  name: string;
  caseCount: number;
  ended?: boolean;
  /** 내 담당 그룹(★) — 앞에 정렬 */
  mine?: boolean;
}

/** 표시 순서: 내 담당(★) → 진행 중 → 종료. 같은 묶음 안에서는 원래 순서(sort_order) 유지 */
function orderGroups(groups: ScopeGroupOption[]): ScopeGroupOption[] {
  const rank = (g: ScopeGroupOption) => (g.ended ? 2 : g.mine ? 0 : 1);
  return groups.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i).map((x) => x.g);
}

/**
 * 범위 스위처 (P25) — 운영사·발주처 화면 상단에 상시 노출.
 * "행사 전체"와 사업그룹(라운드)을 한 번의 클릭으로 오가며, 아래 모든 명단·매칭·정산·조사·설정이 이 범위로 필터된다.
 */
export function ScopeSwitcher({ groups, currentGroupId, emptyHref }: { groups: ScopeGroupOption[]; currentGroupId: string | null; /** 그룹이 없을 때 안내 문구의 이동 링크 (운영사: 운영 설정 › 사업그룹) */ emptyHref?: string }) {
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

  const pill = (active: boolean, disabled: boolean, ended = false) =>
    cn(
      // (P31) 폰은 탭 타깃 확보를 위해 py-2
      'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition-colors sm:py-1',
      active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
      (disabled || ended) && 'opacity-60',
    );
  const ordered = orderGroups(groups);

  return (
    <div className="border-b bg-muted/40">
      <div className="no-scrollbar mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4 py-1.5">
        <ScrollActiveTab />
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <Layers className="h-3.5 w-3.5" /> 범위
        </span>
        <button type="button" disabled={pending} aria-pressed={currentGroupId === null} onClick={() => go(null)} className={pill(currentGroupId === null, pending)} title="행사 안 모든 그룹을 한 번에 봅니다">
          행사 전체
        </button>
        {ordered.map((g) => (
          <button
            key={g.id}
            type="button"
            disabled={pending}
            aria-pressed={currentGroupId === g.id}
            onClick={() => go(g.id)}
            className={pill(currentGroupId === g.id, pending, !!g.ended)}
            title={`${g.code} · ${g.name}${g.mine ? ' · 내 담당 그룹' : ''}${g.ended ? ' (종료)' : ''}`}
          >
            {g.mine && <span aria-label="내 담당" className={cn('text-[11px]', currentGroupId === g.id ? 'text-primary-foreground' : 'text-amber-500')}>★</span>}
            <span>{g.name}</span>
            <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', currentGroupId === g.id ? 'bg-primary-foreground/20' : 'bg-muted')}>{g.caseCount}</span>
            {g.ended && <span className="text-[9px] font-normal opacity-80">종료</span>}
          </button>
        ))}
        {groups.length === 0 && (
          <span className="text-xs text-muted-foreground">
            사업그룹이 아직 없습니다 —{' '}
            {emptyHref ? <Link href={emptyHref} className="font-semibold text-primary underline underline-offset-2">운영 설정에서 개설하기</Link> : '운영 설정에서 개설하세요.'}
          </span>
        )}
      </div>
    </div>
  );
}
