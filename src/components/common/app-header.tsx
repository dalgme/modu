import { signOut } from '@/lib/auth/actions';
import { ROLE_LABELS, type UserRole } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';

interface AppHeaderProps {
  name: string;
  role: UserRole;
}

/** 역할별 화면 공통 상단 바 (미드나이트 블루 + 코랄 액센트) */
export function AppHeader({ name, role }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-midnight text-midnight-foreground">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            재
          </span>
          <span className="truncate font-semibold">
            <span className="sm:hidden">재기지원</span>
            <span className="hidden sm:inline">재기지원사업 운영관리</span>
          </span>
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium">
            {ROLE_LABELS[role]}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden max-w-[8rem] truncate text-sm text-midnight-foreground/70 sm:inline">
            {name}
          </span>
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
