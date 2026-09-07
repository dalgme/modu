import { requireStaff } from '@/lib/auth/guards';
import { AppHeader } from '@/components/common/app-header';
import { NextlabNav } from '@/components/nextlab/nextlab-nav';
import { InstitutionNav } from '@/components/nav/institution-nav';

// 관리 화면(감사로그·지원유형 설정·문자발송)은 진흥원·넥스트랩 공용.
// 각 역할의 상단 탭 내비를 유지해 관리 화면에서도 메뉴가 끊기지 않도록 한다.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader name={profile.name} role={profile.role} />
      {profile.role === 'nextlab' && <NextlabNav />}
      {profile.role === 'institution' && <InstitutionNav />}
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
