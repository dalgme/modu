import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { AppHeader } from '@/components/common/app-header';
import { MentorNav } from '@/components/mentor/mentor-nav';
import { MobileTabBar } from '@/components/common/mobile-tab-bar';
import { CalendarDays, Coins, LayoutDashboard, MessageSquare, UserCircle } from 'lucide-react';
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
      <div className="mx-auto max-w-5xl px-4 py-6 pb-24 md:pb-6">{children}</div>
      <MobileTabBar
        tabs={[
          { href: '/mentor/dashboard', label: '홈', icon: LayoutDashboard },
          { href: '/mentor/schedule', label: '스케줄', icon: CalendarDays },
          { href: '/mentor/settlements', label: '정산', icon: Coins },
          { href: '/mentor/qna', label: '문의', icon: MessageSquare },
          { href: '/mentor/profile', label: '프로필', icon: UserCircle },
        ]}
      />
    </div>
  );
}
