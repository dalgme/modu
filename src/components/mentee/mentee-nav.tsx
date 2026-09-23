'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { useScrollActiveTab } from '@/components/common/use-scroll-active-tab';

const TABS = [
  { href: '/mentee/dashboard', label: '내 진행 현황' },
  { href: '/mentee/schedule', label: '스케줄' },
  { href: '/mentee/rounds', label: '회차 확인·서명' },
  { href: '/mentee/survey', label: '만족도 조사' },
  { href: '/mentee/documents', label: '내 서류' },
  { href: '/mentee/inquiries', label: '문의·멘토 메시지' },
];

/** 멘티 상단 탭 내비게이션 (진행현황 / 문의하기·내역) */
export function MenteeNav() {
  const pathname = usePathname();
  useScrollActiveTab(pathname);
  // 동의 화면에서는 메뉴를 숨긴다 — 동의 전에는 다른 화면으로 갈 수 없다 (P28)
  if (pathname.startsWith('/mentee/consent')) return null;
  return (
    <nav className="sticky top-14 z-30 border-b bg-background/90 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex max-w-3xl no-scrollbar gap-1.5 overflow-x-auto px-4 py-2">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
