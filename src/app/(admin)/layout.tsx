import { requireStaff } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { AppHeader } from '@/components/common/app-header';
import { NextlabNav } from '@/components/nextlab/nextlab-nav';
import { InstitutionNav } from '@/components/nav/institution-nav';
import { GRADE_LABELS } from '@/lib/auth/capabilities';
import { ScopeSwitcher } from '@/components/common/scope-switcher';
import { listMyGroups } from '@/lib/programs/data';
import { StaffMobileTabs } from '@/components/nav/staff-mobile-tabs';

// 관리 화면(감사로그·설정·문자발송)은 발주처·운영사 공용. 각 역할의 상단 탭을 유지한다.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  const ctx = await requireContext(profile);
  // 운영사·발주처 콘솔과 같은 범위 스위처 — 문자 수신자 목록 등이 이 범위로 필터된다 (P28)
  const groups = await listMyGroups(ctx.programId, { id: profile.id, role: ctx.role, isPlatformAdmin: false });
  const scopeGroups = groups.map((g) => ({ id: g.group.id, code: g.group.code, name: g.group.name, caseCount: g.caseCount, ended: g.group.status !== 'active', mine: g.mine }));
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        name={profile.name}
        role={profile.role}
        branding={ctx.branding}
        context={{ programName: ctx.program.name, groupName: ctx.group?.name ?? null }}
        gradeLabel={ctx.grade && ctx.grade !== 'pl' ? GRADE_LABELS[ctx.grade] : null}
      />
      {profile.role === 'nextlab' && <NextlabNav />}
      {profile.role === 'institution' && <InstitutionNav />}
      <ScopeSwitcher groups={scopeGroups} currentGroupId={ctx.supportTypeId} emptyHref={profile.role === 'nextlab' ? '/nextlab/settings?tab=groups' : undefined} />
      <div className="mx-auto max-w-6xl px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">{children}</div>
      {/* (P31) 문자 발송 등 공용 화면에서도 역할별 하단 탭바 유지 */}
      {(profile.role === 'nextlab' || profile.role === 'institution') && <StaffMobileTabs role={profile.role} />}
    </div>
  );
}
