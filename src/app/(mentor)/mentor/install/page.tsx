import { requireRole } from '@/lib/auth/guards';
import { PwaInstallGuide } from '@/components/common/pwa-install-guide';

export const dynamic = 'force-dynamic';

export default async function Page() {
  // 멘토 본인 + 넥스트랩·진흥원(회원 열람 시 안내 확인)도 접근 가능
  await requireRole(['mentor', 'nextlab', 'institution']);

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">휴대폰 설치 안내</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          현장에서 편리하게 쓰도록, 이 시스템을 휴대폰에 앱처럼 설치하는 방법을 안내합니다.
        </p>
      </div>

      <PwaInstallGuide />
    </main>
  );
}
