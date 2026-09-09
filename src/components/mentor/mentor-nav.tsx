'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const TABS = [
  { href: '/mentor/dashboard', label: '대시보드' },
  { href: '/mentor/settlements', label: '정산 내역' },
  { href: '/mentor/forms', label: '위촉 서류' },
  { href: '/mentor/profile', label: '내 프로필' },
  { href: '/mentor/signature', label: '내 서명' },
  { href: '/mentor/qna', label: '문의 및 요청하기' },
  { href: '/mentor/guide', label: '이용안내', tone: 'green' as const },
  { href: '/mentor/install', label: '📱 휴대폰 설치', tone: 'purple' as const },
];

/** 멘토 상단 탭 내비게이션 (운영사 내비와 동일한 pill·sticky 스타일) */
export function MentorNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-14 z-30 border-b bg-background/90 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 py-2">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          const tone = 'tone' in t ? t.tone : undefined;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                tone === 'green' &&
                  (active
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60'),
                tone === 'purple' &&
                  (active
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-900/60'),
                !tone &&
                  (active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'),
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
