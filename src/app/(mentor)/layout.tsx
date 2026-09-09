import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { AppHeader } from '@/components/common/app-header';
import { MentorNav } from '@/components/mentor/mentor-nav';
import { featureEnabled } from '@/lib/platform/features';

export default async function MentorLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        name={profile.name}
        role={profile.role}
        branding={ctx.branding}
        context={{ programName: ctx.program.name, groupName: ctx.group?.name ?? null }}
      />
      <MentorNav showForms={featureEnabled(ctx.program.features, 'mentor_forms')} />
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
