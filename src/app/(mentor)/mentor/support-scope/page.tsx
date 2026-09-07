import { requireMentor } from '@/lib/auth/guards';
import { SupportScopeGuide } from '@/components/support/support-scope-guide';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireMentor();
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">지원 영역·항목 안내</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          재기지원사업 유형별 지원 가능 영역·세부 항목·컨설팅·필요 서류를 정리했습니다.
        </p>
      </div>
      <SupportScopeGuide />
    </main>
  );
}
