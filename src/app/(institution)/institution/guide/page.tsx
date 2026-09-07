import { requireInstitution } from '@/lib/auth/guards';
import { InstitutionGuideContent } from '@/components/institution/institution-guide-content';

export default async function Page() {
  await requireInstitution();
  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">이용방법</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          대전 소상공인·자영업자 재기지원사업(컨설팅·경영개선·폐업정리) 운영관리 플랫폼 사용법을
          단계별로 안내합니다.
        </p>
      </div>

      <InstitutionGuideContent />
    </main>
  );
}
