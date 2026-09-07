import { listPlatformAdmins } from '@/lib/platform/data';
import { PlatformAdminsForm } from '@/components/platform/program-actions';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const admins = await listPlatformAdmins();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">플랫폼 관리자</h1>
        <p className="mt-1 text-sm text-muted-foreground">모든 행사를 볼 수 있고 행사 개설·복제·스태프 발급을 할 수 있는 계정입니다. 스태프(운영사·발주처) 계정만 지정할 수 있습니다.</p>
      </div>
      <PlatformAdminsForm admins={admins} />
    </main>
  );
}
