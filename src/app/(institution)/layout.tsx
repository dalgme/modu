import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMyGroups } from '@/lib/programs/data';
import { AppHeader } from '@/components/common/app-header';
import { ScopeSwitcher } from '@/components/common/scope-switcher';
import { InstitutionNav } from '@/components/nav/institution-nav';

export default async function InstitutionLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const groups = await listMyGroups(ctx.programId, { id: profile.id, role: ctx.role, isPlatformAdmin: false });
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        name={profile.name}
        role={profile.role}
        branding={ctx.branding}
        context={{ programName: ctx.program.name, groupName: ctx.group?.name ?? null }}
      />
      <InstitutionNav />
      <ScopeSwitcher
        groups={groups.map((g) => ({ id: g.group.id, code: g.group.code, name: g.group.name, caseCount: g.caseCount, ended: g.group.status !== 'active' }))}
        currentGroupId={ctx.supportTypeId}
      />
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
