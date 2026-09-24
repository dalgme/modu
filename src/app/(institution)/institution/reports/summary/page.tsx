import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { fmt } from '@/lib/programs/branding';
import { listSummarySnapshots } from '@/lib/reports/summary';
import { SummarySnapshotsPanel } from '@/components/reports/summary-snapshots-panel';

export const dynamic = 'force-dynamic';

/** (P31) 발주처 종합결과리포트 — 운영사가 [발주처 공유용]으로 생성한 스냅샷만 열람·저장 */
export default async function Page() {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const snapshots = await listSummarySnapshots(ctx.programId, ctx.supportTypeId ?? null, { audience: 'client' });
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">종합결과리포트</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name}{ctx.group ? ` · ${ctx.group.name}` : ' · 행사 전체'} — {fmt('{operator}가 발주처 공유용으로 생성한 종합결과리포트입니다. 생성 시점의 데이터로 고정된 스냅샷을 HTML·PDF·Word·Excel·PowerPoint 로 저장할 수 있습니다.', ctx.branding)}
        </p>
      </div>
      <SummarySnapshotsPanel snapshots={snapshots} readOnly />
    </main>
  );
}
