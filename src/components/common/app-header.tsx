import Link from 'next/link';
import { ChevronRight, Repeat } from 'lucide-react';

import { signOut } from '@/lib/auth/actions';
import { leaveContextAction } from '@/lib/programs/actions';
import { type UserRole } from '@/lib/auth/roles';
import { PLATFORM_BRANDING, roleLabel, type Branding } from '@/lib/programs/branding';
import { Button } from '@/components/ui/button';

interface AppHeaderProps {
  name: string;
  role: UserRole;
  /** 행사 브랜딩 (컨텍스트 밖에서는 플랫폼 기본) */
  branding?: Branding;
  /** 현재 컨텍스트 — 상단에 `행사명 › 그룹명` 표시 (docs/MODU-DESIGN.md §18-3) */
  context?: { programName: string; groupName: string | null } | null;
}

/** 모든 역할 공통 상단 바: 앱 타이틀 + 행사/그룹 컨텍스트 + 역할 배지 + 로그아웃 */
export function AppHeader({ name, role, branding = PLATFORM_BRANDING, context = null }: AppHeaderProps) {
  const initial = (branding.programName || branding.appTitle).slice(0, 1);
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-midnight text-midnight-foreground">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <Link href="/hub" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            {initial}
          </Link>
          {context ? (
            <span className="flex min-w-0 items-center gap-1 font-semibold">
              <span className="truncate">{context.programName}</span>
              {context.groupName ? (
                <>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
                  <span className="truncate">{context.groupName}</span>
                </>
              ) : (
                <>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
                  <span className="truncate text-midnight-foreground/70">행사 전체</span>
                </>
              )}
            </span>
          ) : (
            <span className="truncate font-semibold">{branding.appTitle}</span>
          )}
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium">
            {roleLabel(role, branding)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {context && (
            <form action={leaveContextAction}>
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="gap-1 text-midnight-foreground/80 hover:bg-white/10 hover:text-midnight-foreground"
                title="다른 행사/그룹으로 전환"
              >
                <Repeat className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">전환</span>
              </Button>
            </form>
          )}
          <span className="hidden max-w-[8rem] truncate text-sm text-midnight-foreground/70 sm:inline">{name}</span>
          <form action={signOut}>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="border-white/20 bg-transparent text-midnight-foreground hover:bg-white/10 hover:text-midnight-foreground"
            >
              로그아웃
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
