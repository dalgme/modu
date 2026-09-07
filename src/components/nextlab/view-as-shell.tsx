import Link from 'next/link';

import type { Tables } from '@/types/database';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { VIEW_AS_TABS } from '@/components/nextlab/view-as-dashboard';
import { ViewAsStartButton } from '@/components/nextlab/view-as-start-button';
import { getImpersonation, ALLOWED_TARGET_ROLES } from '@/lib/auth/impersonation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 회원 열람(view-as) 공통 상단 — 열람 배너(회원관리로 돌아가기) + 대상 회원의 상단 메뉴 탭.
 * 대시보드·케이스 상세 등 모든 view-as 화면에서 동일하게 렌더해, 실제 로그인 화면처럼
 * 회원의 상단 메뉴가 항상 보이도록 한다.
 * @param activeTab 현재 활성 탭 key (케이스 상세 등 특정 탭이 없으면 생략)
 */
export async function ViewAsShell({
  target,
  activeTab,
}: {
  target: Tables<'users'>;
  activeTab?: string;
}) {
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
          <span className="text-muted-foreground">
            {actingAsThisUser ? '(대행 중 — 작업이 실제로 처리됩니다)' : '(열람 전용)'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAct && !actingAsThisUser && (
            <ViewAsStartButton
              targetUserId={target.id}
              targetName={target.name}
              className="gap-1.5"
            />
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/nextlab/members">회원관리로 돌아가기</Link>
          </Button>
        </div>
      </div>

      {canAct && !actingAsThisUser && (
        <p className="-mt-1 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
          지금은 <b>열람 전용</b>이라 신청서 송신·서류 등록 버튼이 동작하지 않습니다. 위{' '}
          <b>[{target.name} 멘토로 대행 시작]</b> 을 누르면 이 멘토를 대신해 실제 업무를 처리할 수
          있습니다. (실행자는 감사기록에 남습니다)
        </p>
      )}

      {/* 대상 회원의 상단 메뉴 탭 (실제 로그인 화면과 동일) */}
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
                t.tone === 'green' &&
                  (isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60'),
                t.tone === 'purple' &&
                  (isActive
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-900/60'),
                t.tone === 'amber' &&
                  (isActive
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60'),
                t.tone === 'sky' &&
                  (isActive
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:hover:bg-sky-900/60'),
                !t.tone &&
                  (isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'),
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
