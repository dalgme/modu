'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { useScrollActiveTab } from '@/components/common/use-scroll-active-tab';

const TABS: { href: string; label: string; match?: string[]; external?: boolean }[] = [
  { href: '/nextlab/dashboard', label: '대시보드' },
  { href: '/nextlab/reports', label: '리포트' },
  { href: '/nextlab/roster', label: '회원 명단', match: ['/nextlab/cases', '/nextlab/members', '/nextlab/view'] },
  { href: '/nextlab/board', label: '게시판', match: ['/nextlab/requests'] },
  { href: '/nextlab/settlements', label: '정산·품의' },
  { href: '/nextlab/surveys', label: '조사' },
  { href: '/nextlab/settings', label: '운영 설정', match: ['/admin/settings/features', '/admin/audit-logs'] },
  { href: '/admin/settings/sms', label: '문자 발송' },
  // 사용 안내서(정적 HTML) — 처음 쓰는 담당자가 메뉴에서 바로 찾도록 상시 노출 (P28)
  { href: '/guide.html#tab-op', label: '이용안내', external: true },
];

/** 운영사 총괄관리자 상단 탭 내비게이션 */
export function NextlabNav() {
  const pathname = usePathname();
  useScrollActiveTab(pathname);
  return (
    <nav className="sticky top-14 z-30 border-b bg-background/90 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75 print:hidden">
      <div className="mx-auto flex max-w-6xl no-scrollbar gap-1.5 overflow-x-auto px-4 py-2">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`) || (t.match ?? []).some((m) => pathname === m || pathname.startsWith(`${m}/`));
          const cls = cn(
            'whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
            active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            t.external && 'text-emerald-700 hover:text-emerald-800 dark:text-emerald-400',
          );
          if (t.external) {
            return (
              <a key={t.href} href={t.href} target="_blank" rel="noreferrer" className={cls} title="사용 안내서가 새 창으로 열립니다">
                {t.label}
              </a>
            );
          }
          return (
            <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className={cls}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
