import { requireMentor } from '@/lib/auth/guards';
import { AppHeader } from '@/components/common/app-header';
import { MentorNav } from '@/components/mentor/mentor-nav';

export default async function MentorLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireMentor();
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader name={profile.name} role={profile.role} />
      <MentorNav />
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
