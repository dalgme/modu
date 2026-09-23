'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface MobileTab {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * 모바일 하단 탭바 (P28) — 폰에서 가장 많이 쓰는 4~5개 메뉴를 엄지 위치에 고정. md 이상에서는 숨긴다.
 * safe-area 하단 여백을 반영하고, 콘텐츠 컨테이너는 pb-20 으로 가려지지 않게 한다.
 */
export function MobileTabBar({ tabs, hideOn = [] }: { tabs: MobileTab[]; /** 이 경로(접두)에서는 탭바를 숨긴다 — 예: 동의 화면 */ hideOn?: string[] }) {
  const pathname = usePathname();
  if (hideOn.some((h) => pathname.startsWith(h))) return null;
  return (
    <nav aria-label="하단 메뉴" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`) || pathname.startsWith(`${t.href}?`);
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? 'page' : undefined} className={cn('flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', active ? 'text-primary' : 'text-muted-foreground')}>
                <Icon className={cn('h-5 w-5', active && 'text-primary')} />
                <span className="leading-none">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
