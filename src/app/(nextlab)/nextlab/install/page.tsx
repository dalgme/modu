import { requireNextlab } from '@/lib/auth/guards';
import { PwaInstallGuide } from '@/components/common/pwa-install-guide';

export const dynamic = 'force-dynamic';

/** (P31) 운영사 휴대폰 설치 안내 — 멘토·발주처 설치 페이지와 같은 안내 컴포넌트 재사용 */
export default async function Page() {
  await requireNextlab();

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">휴대폰 설치 안내</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          현장이나 이동 중에도 편하게 쓰도록, 운영 콘솔을 휴대폰 홈 화면에 앱처럼 추가하는 방법을 안내합니다.
        </p>
      </div>

      <PwaInstallGuide />
    </main>
  );
}
