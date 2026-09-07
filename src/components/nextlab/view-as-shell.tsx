import Link from 'next/link';

import type { Tables } from '@/types/database';
import { ROLE_LABELS, type UserRole } from '@/lib/auth/roles';
import { ViewAsStartButton } from '@/components/nextlab/view-as-start-button';
import { getImpersonation, ALLOWED_TARGET_ROLES } from '@/lib/auth/impersonation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ViewAsTab {
  key: string;
  label: string;
}

/** 회원 열람 화면의 탭 — 역할별 (P2 최소: 대시보드만. 나머지 탭은 해당 기능 단계에서 추가) */
export const VIEW_AS_TABS: Record<UserRole, ViewAsTab[]> = {
  mentor: [{ key: 'dashboard', label: '대시보드' }],
  mentee: [{ key: 'dashboard', label: '내 진행 현황' }],
  institution: [{ key: 'dashboard', label: '대시보드' }],
  nextlab: [{ key: 'dashboard', label: '대시보드' }],
};

/** 회원 열람(view-as) 공통 상단 — 열람 배너 + 대상 회원의 탭 */
export async function ViewAsShell({ target, activeTab }: { target: Tables<'users'>; activeTab?: string }) {
  const tabs = VIEW_AS_TABS[target.role];
  const imp = await getImpersonation();
  const actingAsThisUser = imp?.target.id === target.id;
  const canAct = ALLOWED_TARGET_ROLES.includes(target.role);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span aria-hidden>🔍</span>
          <span className="font-medium text-primary">
            {target.name} · {ROLE_LABELS[target.role]} 화면 열람 중
          </span>
          <span className="text-muted-foreground">{actingAsThisUser ? '(대행 중 — 작업이 실제로 처리됩니다)' : '(열람 전용)'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAct && !actingAsThisUser && (
            <ViewAsStartButton targetUserId={target.id} targetName={target.name} className="gap-1.5" />
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/nextlab/members">회원관리로 돌아가기</Link>
          </Button>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1.5 border-b pb-2">
        {tabs.map((t) => {
          const isActive = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={`/nextlab/view/${target.id}?tab=${t.key}`}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors',
                isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
