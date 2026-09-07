import Link from 'next/link';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listSupportTypes } from '@/lib/programs/data';
import { BulkImportPanel } from '@/components/nextlab/bulk-import-panel';

export const maxDuration = 60;

export default async function Page() {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const groups = await listSupportTypes(ctx.programId);
  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">멘토 · 멘티 엑셀 일괄 등록</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ctx.program.name} — 템플릿을 내려받아 채운 뒤 올리면 검증 결과를 먼저 보여주고, 확인 후 계정과 케이스를 만듭니다.
          </p>
        </div>
        <Link href="/nextlab/members" className="text-sm text-muted-foreground hover:underline">
          회원관리로
        </Link>
      </div>
      <BulkImportPanel groups={groups.filter((g) => g.status === 'active').map((g) => ({ code: g.code, name: g.name }))} />
    </main>
  );
}
