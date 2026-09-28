import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { AppHeader } from '@/components/common/app-header';
import { SafeSlot } from '@/components/common/safe-slot';
import { MentorNav } from '@/components/mentor/mentor-nav';
import { MobileTabBar } from '@/components/common/mobile-tab-bar';

export default async function MentorLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  return (
    <div className="min-h-screen bg-muted/20">
      <SafeSlot name="header">
        <AppHeader
          name={profile.name}
          role={profile.role}
          branding={ctx.branding}
          context={{ programName: ctx.program.name, groupName: ctx.group?.name ?? null }}
        />
      </SafeSlot>
      <MentorNav />
      <div className="mx-auto max-w-5xl px-4 py-6 pb-24 md:pb-6">{children}</div>
      <SafeSlot name="mobile-tabs">
        <MobileTabBar
          tabs={[
            { href: '/mentor/dashboard', label: '홈', icon: 'dashboard' },
            { href: '/mentor/schedule', label: '스케줄', icon: 'calendar' },
            { href: '/mentor/settlements', label: '정산', icon: 'coins' },
            { href: '/mentor/qna', label: '문의', icon: 'message' },
            { href: '/mentor/profile', label: '프로필', icon: 'user' },
          ]}
        />
      </SafeSlot>
    </div>
  );
}
