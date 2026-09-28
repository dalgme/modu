'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, ClipboardList, Coins, FileText, Inbox, LayoutDashboard, MessageSquare, MessageSquareText, PenLine, UserCircle, Users, type LucideIcon } from 'lucide-react';

import { MoreMenuSheet, type MoreMenuItem } from '@/components/common/more-menu-sheet';
import { cn } from '@/lib/utils';

/**
 * 탭 아이콘은 **이름(문자열)** 로 받는다 — 레이아웃(서버 컴포넌트)이 lucide 컴포넌트 객체(forwardRef)를 props 로 넘기면
 * "Functions cannot be passed directly to Client Components" 로 페이지 전체가 500 이 난다(2026-09-28 운영 장애). 매핑은 이 파일 안에서만.
 */
const TAB_ICONS = {
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  coins: Coins,
  message: MessageSquare,
  'message-text': MessageSquareText,
  user: UserCircle,
  users: Users,
  pen: PenLine,
  clipboard: ClipboardList,
  file: FileText,
  inbox: Inbox,
} satisfies Record<string, LucideIcon>;
export type MobileTabIcon = keyof typeof TAB_ICONS;

export interface MobileTab {
  href: string;
  label: string;
  icon: MobileTabIcon;
  /** (P31) 이 경로(접두)도 활성으로 본다 — 예: 매칭 탭에 /nextlab/cases */
  match?: string[];
  /** (P31) 미처리 건수 배지 (0 이면 표시 안 함) */
  badge?: number;
}

/**
 * 모바일 하단 탭바 (P28) — 폰에서 가장 많이 쓰는 4~5개 메뉴를 엄지 위치에 고정. md 이상에서는 숨긴다.
 * safe-area 하단 여백을 반영하고, 콘텐츠 컨테이너는 pb-[calc(5rem+env(safe-area-inset-bottom))] 로 가려지지 않게 한다.
 * (P31) `more` 를 넘기면 마지막 칸에 [더보기] 시트를 붙인다(나머지 메뉴·로그아웃).
 */
export function MobileTabBar({ tabs, hideOn = [], more }: { tabs: MobileTab[]; /** 이 경로(접두)에서는 탭바를 숨긴다 — 예: 동의 화면 */ hideOn?: string[]; more?: MoreMenuItem[] }) {
  const pathname = usePathname();
  if (hideOn.some((h) => pathname.startsWith(h))) return null;
  const cols = tabs.length + (more ? 1 : 0);
  const isActive = (t: MobileTab) => {
    const base = t.href.split('?')[0];
    return pathname === base || pathname.startsWith(`${base}/`) || (t.match ?? []).some((m) => pathname === m || pathname.startsWith(`${m}/`));
  };
  const anyActive = tabs.some(isActive);
  return (
    <nav aria-label="하단 메뉴" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden print:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const active = isActive(t);
          const Icon = TAB_ICONS[t.icon];
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? 'page' : undefined} className={cn('relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', active ? 'text-primary' : 'text-muted-foreground')}>
                <span className="relative">
                  <Icon className={cn('h-5 w-5', active && 'text-primary')} />
                  {!!t.badge && t.badge > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-status-rejected px-1 text-center text-[9px] font-bold leading-4 text-white" aria-label={`미처리 ${t.badge}건`}>
                      {t.badge > 99 ? '99+' : t.badge}
                    </span>
                  )}
                </span>
                <span className="leading-none">{t.label}</span>
              </Link>
            </li>
          );
        })}
        {more && (
          <li>
            <MoreMenuSheet items={more} active={!anyActive} />
          </li>
        )}
      </ul>
    </nav>
  );
}
