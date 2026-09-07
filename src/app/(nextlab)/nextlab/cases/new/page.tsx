import Link from 'next/link';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listSupportTypes } from '@/lib/programs/data';
import { CaseRegisterForm } from '@/components/nextlab/case-register-form';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const groups = (await listSupportTypes(ctx.programId)).filter((g) => g.status === 'active');
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">멘티 등록</h1>
          <p className="mt-1 text-sm text-muted-foreground">{ctx.program.name} — 케이스를 만들고 멘티 계정을 발급합니다. 여러 명은 <Link href="/nextlab/members/import" className="underline">엑셀 일괄 등록</Link>을 이용하세요.</p>
        </div>
        <Link href="/nextlab/dashboard" className="text-sm text-muted-foreground hover:underline">대시보드</Link>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-xl border bg-background p-4 text-sm text-destructive">활성 사업그룹이 없습니다. <Link href="/nextlab/settings?tab=groups" className="underline">운영 설정</Link>에서 그룹을 먼저 만드세요.</p>
      ) : (
        <CaseRegisterForm groups={groups.map((g) => ({ id: g.id, name: g.name, code: g.code }))} defaultGroupId={ctx.supportTypeId ?? null} />
      )}
    </main>
  );
}
