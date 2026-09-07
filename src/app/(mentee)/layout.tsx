import { requireRole } from '@/lib/auth/guards';
import { AppHeader } from '@/components/common/app-header';
import { MenteeNav } from '@/components/mentee/mentee-nav';

// 멘티 그룹: 인증·역할·비밀번호만 검사 (개인정보 동의 게이팅은 각 페이지의 requireMentee()).
export default async function MenteeLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(['mentee']);
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader name={profile.name} role={profile.role} />
      <MenteeNav />
      <div className="mx-auto max-w-3xl px-4 py-6">{children}</div>
    </div>
  );
}
