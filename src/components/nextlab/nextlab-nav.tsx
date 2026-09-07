'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const TABS = [
  { href: '/nextlab/dashboard', label: '대시보드' },
  { href: '/nextlab/board', label: '현황판' },
  { href: '/nextlab/mentoring-logs', label: '멘토링 일지 열람' },
  { href: '/nextlab/inquiries', label: '멘티 문의' },
  { href: '/nextlab/qna', label: '멘토·운영 게시판' },
  { href: '/nextlab/members', label: '회원관리' },
  { href: '/admin/settings/support-types', label: '지원유형' },
  { href: '/admin/settings/features', label: '기능 노출' },
  { href: '/admin/settings/sms', label: '문자발송' },
  { href: '/admin/settings/faq', label: '멘토 FAQ' },
  { href: '/admin/audit-logs', label: '감사로그' },
];

/** 넥스트랩 총괄관리자 상단 탭 내비게이션 */
export function NextlabNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-14 z-30 border-b bg-background/90 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 py-2">
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
