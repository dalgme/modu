import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMyGroups } from '@/lib/programs/data';
import { AppHeader } from '@/components/common/app-header';
import { ScopeSwitcher } from '@/components/common/scope-switcher';
import { NextlabNav } from '@/components/nextlab/nextlab-nav';
import { GRADE_LABELS } from '@/lib/auth/capabilities';
import { MobileTabBar } from '@/components/common/mobile-tab-bar';
import { Coins, FileSpreadsheet, LayoutDashboard, MessageSquare, Users } from 'lucide-react';

export default async function NextlabLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const groups = await listMyGroups(ctx.programId, { id: profile.id, role: ctx.role, isPlatformAdmin: false });
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
        groups={groups.map((g) => ({ id: g.group.id, code: g.group.code, name: g.group.name, caseCount: g.caseCount, ended: g.group.status !== 'active' }))}
        currentGroupId={ctx.supportTypeId}
      />
      {ctx.grade === 'observer' && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
          옵저버(현황 확인·자문) 계정입니다. 열람과 종합결과리포트 생성만 가능하고, 변경 작업은 제한됩니다.
        </p>
      )}
      <div className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-6">{children}</div>
      <MobileTabBar
        tabs={[
          { href: '/nextlab/dashboard', label: '홈', icon: LayoutDashboard },
          { href: '/nextlab/roster', label: '회원', icon: Users },
          { href: '/nextlab/reports', label: '리포트', icon: FileSpreadsheet },
          { href: '/nextlab/board', label: '게시판', icon: MessageSquare },
          { href: '/nextlab/settlements', label: '정산', icon: Coins },
        ]}
      />
    </div>
  );
}
