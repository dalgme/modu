import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { AppHeader } from '@/components/common/app-header';
import { InstitutionNav } from '@/components/nav/institution-nav';

export default async function InstitutionLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        name={profile.name}
        role={profile.role}
        branding={ctx.branding}
        context={{ programName: ctx.program.name, groupName: ctx.group?.name ?? null }}
      />
      <InstitutionNav />
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
