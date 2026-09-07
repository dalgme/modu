import { requireStaff } from '@/lib/auth/guards';
import { getFeatureFlags } from '@/lib/data/app-settings';
import { FeatureTogglesCard } from '@/components/admin/feature-toggles-card';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireStaff();
  const flags = await getFeatureFlags();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold">기능 노출</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          단계별로 필요한 기능만 노출합니다. 아래 항목은 본 컨설팅·지원 단계에서 기본 숨김이며,
          선정/변경/지급 단계에서 사용할 때 켜세요.
        </p>
      </div>
      <FeatureTogglesCard initial={flags} />
    </main>
  );
}
