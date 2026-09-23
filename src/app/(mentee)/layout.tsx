import { requireRole } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { AppHeader } from '@/components/common/app-header';
import { MenteeNav } from '@/components/mentee/mentee-nav';
import { MobileTabBar } from '@/components/common/mobile-tab-bar';
import { CalendarDays, ClipboardList, FileText, LayoutDashboard, PenLine } from 'lucide-react';

// 멘티 그룹: 인증·역할·비밀번호·행사 컨텍스트만 검사 (개인정보 동의 게이팅은 각 페이지의 requireMentee()).
export default async function MenteeLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(['mentee']);
  const ctx = await requireContext(profile);
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        name={profile.name}
        role={profile.role}
        branding={ctx.branding}
        context={{ programName: ctx.program.name, groupName: ctx.group?.name ?? null }}
      />
      <MenteeNav />
      <div className="mx-auto max-w-3xl px-4 py-6 pb-24 md:pb-6">{children}</div>
      <MobileTabBar
        tabs={[
          { href: '/mentee/dashboard', label: '홈', icon: LayoutDashboard },
          { href: '/mentee/schedule', label: '일정', icon: CalendarDays },
          { href: '/mentee/rounds', label: '서명', icon: PenLine },
          { href: '/mentee/survey', label: '만족도', icon: ClipboardList },
          { href: '/mentee/documents', label: '서류', icon: FileText },
        ]}
      />
    </div>
  );
}
