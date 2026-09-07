import { requireStaff } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { AppHeader } from '@/components/common/app-header';
import { NextlabNav } from '@/components/nextlab/nextlab-nav';
import { InstitutionNav } from '@/components/nav/institution-nav';

// 관리 화면(감사로그·설정·문자발송)은 발주처·운영사 공용. 각 역할의 상단 탭을 유지한다.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  const ctx = await requireContext(profile);
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        name={profile.name}
        role={profile.role}
        branding={ctx.branding}
        context={{ programName: ctx.program.name, groupName: ctx.group?.name ?? null }}
      />
      {profile.role === 'nextlab' && <NextlabNav />}
      {profile.role === 'institution' && <InstitutionNav />}
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
