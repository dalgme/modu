'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const TABS = [
  { href: '/institution/dashboard', label: '대시보드' },
  { href: '/institution/board', label: '현황판' },
  { href: '/institution/mentoring-logs', label: '멘토링 일지 열람' },
  { href: '/institution/mentors', label: '멘토 현황' },
  { href: '/institution/requests', label: '요청/문의', tone: 'amber' as const },
  { href: '/admin/settings/sms', label: '문자발송 현황', tone: 'sky' as const },
  { href: '/institution/guide', label: '이용방법', tone: 'green' as const },
  { href: '/institution/install', label: '📱 핸드폰 설치', tone: 'purple' as const },
];

/** 진흥원 상단 탭 내비게이션 (멘토·넥스트랩 내비와 동일한 pill·sticky 스타일) */
export function InstitutionNav() {
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
                tone === 'amber' &&
                  (active
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60'),
                tone === 'sky' &&
                  (active
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:hover:bg-sky-900/60'),
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
