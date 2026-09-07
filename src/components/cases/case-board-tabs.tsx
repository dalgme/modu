import Link from 'next/link';
import { ListChecks, Users, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

const TABS: { key: 'stage' | 'mentor' | 'mentee'; label: string; hint: string; icon: LucideIcon }[] =
  [
    { key: 'stage', label: '진행단계', hint: '단계별 집계', icon: ListChecks },
    { key: 'mentor', label: '멘토별', hint: '담당 멘토 기준', icon: Users },
    { key: 'mentee', label: '멘티별', hint: '업체 목록', icon: Store },
  ];

export type BoardView = (typeof TABS)[number]['key'];

/** 요청 view 문자열 → 유효한 탭 키 (기본 stage) */
export function toBoardView(v?: string): BoardView {
  return v === 'mentor' ? 'mentor' : v === 'mentee' ? 'mentee' : 'stage';
}

/**
 * 현황판 상단 탭 (진행단계 / 멘토별 / 멘티별) — 넥스트랩·진흥원 공통.
 * 세그먼트형 탭: 컨테이너 안에서 선택 탭만 배경·그림자로 도드라지게 표시.
 */
export function CaseBoardTabs({ basePath, active }: { basePath: string; active: BoardView }) {
  return (
    <div
      role="tablist"
      aria-label="현황판 보기"
      className="inline-flex w-full flex-wrap gap-1 rounded-xl border bg-muted/50 p-1 sm:w-auto"
    >
      {TABS.map((t) => {
        const href = t.key === 'stage' ? basePath : `${basePath}?view=${t.key}`;
        const isActive = t.key === active;
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={href}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'group flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all sm:flex-none sm:min-w-[128px]',
              isActive
                ? 'bg-background text-primary shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4 shrink-0',
                isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
            <span className="flex flex-col items-start leading-tight">
              <span>{t.label}</span>
              <span
                className={cn(
                  'text-[11px] font-normal',
                  isActive ? 'text-primary/70' : 'text-muted-foreground/70',
                )}
              >
                {t.hint}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
