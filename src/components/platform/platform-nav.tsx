'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const TABS = [
  { href: '/platform', label: '통합 현황', exact: true },
  { href: '/platform/programs', label: '행사 관리' },
  { href: '/platform/new', label: '행사 개설' },
  { href: '/platform/users', label: '계정 통합 조회' },
  { href: '/platform/admins', label: '플랫폼 관리자' },
  { href: '/platform/audit', label: '통합 감사로그' },
  { href: '/platform/system', label: '시스템 상태' },
];

/** 플랫폼 통합관리 콘솔 상단 탭 — 보라색 계열로 행사 안 화면(주황)과 구분한다 */
export function PlatformNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-14 z-30 border-b border-violet-200 bg-violet-50/95 shadow-sm backdrop-blur dark:border-violet-900 dark:bg-violet-950/40">
      <div className="mx-auto flex max-w-6xl items-center gap-1.5 overflow-x-auto px-4 py-2 text-sm font-semibold">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn('shrink-0 rounded-lg px-3.5 py-2 transition-colors', active ? 'bg-violet-600 text-white shadow-sm' : 'text-violet-950/80 hover:bg-violet-100 dark:text-violet-100 dark:hover:bg-violet-900/60')}
            >
              {t.label}
            </Link>
          );
        })}
        <span className="ml-auto shrink-0 px-2 py-2 text-[11px] text-muted-foreground">통합관리 전용 계정 · 행사 화면은 각 행사의 운영사 계정으로</span>
      </div>
    </nav>
  );
}
