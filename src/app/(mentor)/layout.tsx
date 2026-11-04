import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { AppHeader } from '@/components/common/app-header';
import { SafeSlot } from '@/components/common/safe-slot';
import { MentorNav } from '@/components/mentor/mentor-nav';
import { MobileTabBar } from '@/components/common/mobile-tab-bar';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function MentorLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  // 그룹멘토링을 쓰는 라운드가 있으면 내비에 탭을 띄운다 (select('*') — 컬럼이 없는 DB 에서도 오류 없이 숨김)
  const { data: groups } = await createAdminClient().from('support_types').select('*').eq('program_id', ctx.programId);
  const showGroupMentoring = (groups ?? []).some((g) => !!(g as { group_mentoring_enabled?: boolean }).group_mentoring_enabled && (!ctx.supportTypeId || g.id === ctx.supportTypeId));
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
      <MentorNav showGroupMentoring={showGroupMentoring} />
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
