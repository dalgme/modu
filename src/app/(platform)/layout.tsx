import { requirePlatformAdmin } from '@/lib/auth/guards';
import { PLATFORM_BRANDING } from '@/lib/programs/branding';
import { AppHeader } from '@/components/common/app-header';
import { PlatformNav } from '@/components/platform/platform-nav';

/**
 * 플랫폼 통합관리 콘솔 — 행사 컨텍스트 밖에서 동작한다.
 * 역할 분담: 행사·그룹의 세부 설정(브랜딩·그룹·단가·한도·정책·양식)은 각 행사의 **운영사**가 운영 설정에서 한다.
 * 여기서는 행사 개설·복제·종료, 전 행사 계정 통합 관리, 플랫폼 관리자 지정, 통합 감사로그, 시스템 상태만 다룬다.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const profile = await requirePlatformAdmin();
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader name={profile.name} role={profile.role} branding={PLATFORM_BRANDING} platformMode />
      <PlatformNav />
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
