import { requirePlatformAdmin } from '@/lib/auth/guards';
import { listPlatformAdmins } from '@/lib/platform/data';
import { PlatformAdminsForm } from '@/components/platform/program-actions';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const me = await requirePlatformAdmin();
  const admins = await listPlatformAdmins();
  const isOwner = me.platform_role === 'owner';
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">플랫폼 관리자</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          플랫폼을 개발·운영하는 주체의 계정입니다. 행사의 운영사·발주처와는 무관하며(플랫폼 운영사가 특정 행사의 용역사가 될 수는 있음), 어느 소속·역할의 계정이든 부관리자로 지정할 수 있습니다.
          <b className="text-foreground"> 부관리자 지정·해제는 통합관리자(owner)만</b> 할 수 있습니다.
        </p>
      </div>
      <PlatformAdminsForm admins={admins} isOwner={isOwner} />
    </main>
  );
}
