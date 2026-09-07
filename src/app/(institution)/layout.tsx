import { requireInstitution } from '@/lib/auth/guards';
import { AppHeader } from '@/components/common/app-header';
import { InstitutionNav } from '@/components/nav/institution-nav';

export default async function InstitutionLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireInstitution();
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader name={profile.name} role={profile.role} />
      <InstitutionNav />
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
