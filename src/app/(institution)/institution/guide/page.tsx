import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { InstitutionGuideContent } from '@/components/institution/institution-guide-content';

export default async function Page() {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">이용방법</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name} 멘토링 운영관리 플랫폼 사용법을 단계별로 안내합니다.
        </p>
      </div>

      <InstitutionGuideContent branding={ctx.branding} />
    </main>
  );
}
