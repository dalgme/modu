import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

import { ScrollActiveTab } from '@/components/common/scroll-active-tab';
import { cn } from '@/lib/utils';

export interface SubTabItem {
  key: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  count?: number;
}

/**
 * 화면 상단 하위 메뉴 바 (P27-18·20) — 짙은 청색(미드나이트) 배경, 선택된 메뉴 = 흰색 박스 + 코랄 아이콘/글자.
 * 리포트 탭·회원 명단 탭 공용. 서버 컴포넌트에서 그대로 쓸 수 있다.
 */
export function SubTabs({ items, active, ariaLabel, className }: { items: SubTabItem[]; active: string; ariaLabel?: string; className?: string }) {
  return (
    // (P31) 폰에서는 한 줄 가로 스크롤(스크롤바 숨김) + 현재 탭 자동 스크롤, sm 이상은 줄바꿈
    <nav aria-label={ariaLabel} className={cn('no-scrollbar flex flex-nowrap gap-1 overflow-x-auto rounded-xl bg-midnight p-1.5 shadow-sm sm:flex-wrap sm:overflow-visible', className)}>
      <ScrollActiveTab />
      {items.map((t) => {
        const isActive = t.key === active;
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              isActive ? 'bg-white text-brand-coral shadow' : 'text-midnight-foreground/85 hover:bg-white/10 hover:text-white',
            )}
          >
            {Icon && <Icon className={cn('h-4 w-4', isActive ? 'text-brand-coral' : 'text-midnight-foreground/70')} />}
            {t.label}
            {t.count !== undefined && (
              <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums', isActive ? 'bg-brand-coral/15 text-brand-coral' : 'bg-white/15 text-white')}>{t.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
