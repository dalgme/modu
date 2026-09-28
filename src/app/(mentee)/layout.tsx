import { requireRole } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { AppHeader } from '@/components/common/app-header';
import { SafeSlot } from '@/components/common/safe-slot';
import { MenteeNav } from '@/components/mentee/mentee-nav';
import { MobileTabBar } from '@/components/common/mobile-tab-bar';

// 멘티 그룹: 인증·역할·비밀번호·행사 컨텍스트만 검사 (개인정보 동의 게이팅은 각 페이지의 requireMentee()).
export default async function MenteeLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(['mentee']);
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
      <MenteeNav />
      <div className="mx-auto max-w-3xl px-4 py-6 pb-24 md:pb-6">{children}</div>
      <SafeSlot name="mobile-tabs">
        <MobileTabBar
          hideOn={['/mentee/consent']}
          tabs={[
            { href: '/mentee/dashboard', label: '홈', icon: 'dashboard' },
            { href: '/mentee/schedule', label: '일정', icon: 'calendar' },
            { href: '/mentee/rounds', label: '서명', icon: 'pen' },
            { href: '/mentee/survey', label: '만족도', icon: 'clipboard' },
            { href: '/mentee/documents', label: '서류', icon: 'file' },
          ]}
        />
      </SafeSlot>
    </div>
  );
}
