import { requireMentee } from '@/lib/auth/guards';
import { SupportScopeGuide } from '@/components/support/support-scope-guide';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireMentee();
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">지원 영역·항목 안내</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          내가 받을 수 있는 지원의 영역·세부 항목과 준비 서류를 유형별로 확인하세요.
        </p>
      </div>
      <SupportScopeGuide />
    </main>
  );
}
