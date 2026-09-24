import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMyGroups } from '@/lib/programs/data';
import { AppHeader } from '@/components/common/app-header';
import { ScopeSwitcher } from '@/components/common/scope-switcher';
import { NextlabNav } from '@/components/nextlab/nextlab-nav';
import { GRADE_LABELS } from '@/lib/auth/capabilities';
import { StaffMobileTabs } from '@/components/nav/staff-mobile-tabs';
import { countPendingInbox } from '@/lib/data/requests';
import { countUnreadOperatorRequests } from '@/lib/data/operator-requests';

export default async function NextlabLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  // (P31) 하단 탭 [요청] 배지 = 요청함 대기 + 발주처 요청 미확인 (count 쿼리 2개 — 게시판 처리 대기 탭과 같은 기준)
  const [groups, pendingInbox, unreadOpReq] = await Promise.all([
    listMyGroups(ctx.programId, { id: profile.id, role: ctx.role, isPlatformAdmin: false }),
    countPendingInbox(ctx.programId, ctx.supportTypeId ?? undefined).catch(() => 0),
    countUnreadOperatorRequests(ctx.programId).catch(() => 0),
  ]);
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        name={profile.name}
        role={profile.role}
        branding={ctx.branding}
        context={{ programName: ctx.program.name, groupName: ctx.group?.name ?? null }}
        gradeLabel={ctx.grade && ctx.grade !== 'pl' ? GRADE_LABELS[ctx.grade] : null}
      />
      <NextlabNav />
      <ScopeSwitcher
        groups={groups.map((g) => ({ id: g.group.id, code: g.group.code, name: g.group.name, caseCount: g.caseCount, ended: g.group.status !== 'active', mine: g.mine }))}
        currentGroupId={ctx.supportTypeId}
        emptyHref="/nextlab/settings?tab=groups"
      />
      {ctx.grade === 'observer' && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
          옵저버(현황 확인·자문) 계정입니다. 열람과 종합결과리포트 생성만 가능하고, 변경 작업은 제한됩니다.
        </p>
      )}
      {/* (P31) 하단 탭바(3.5rem)+safe-area 만큼 콘텐츠 하단 여백 */}
      <div className="mx-auto max-w-6xl px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">{children}</div>
      <StaffMobileTabs role="nextlab" pendingCount={pendingInbox + unreadOpReq} />
    </div>
  );
}
