import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listSummarySnapshots } from '@/lib/reports/summary';
import { SummarySnapshotsPanel } from '@/components/reports/summary-snapshots-panel';

export const dynamic = 'force-dynamic';

/** 종합결과리포트 — 생성일 기준 고정 스냅샷 목록·생성·내보내기 (운영사 전원, 옵저버 포함) */
export default async function Page() {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const snapshots = await listSummarySnapshots(ctx.programId, ctx.supportTypeId ?? null);
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">종합결과리포트</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name}{ctx.group ? ` · ${ctx.group.name}` : ' · 행사 전체'} — 생성 시점의 데이터를 고정한 스냅샷입니다. 옵저버를 포함한 운영사 전원이 생성·열람할 수 있고, HTML·PDF·Word·Excel·PowerPoint 로 저장합니다.
        </p>
      </div>
      <SummarySnapshotsPanel snapshots={snapshots} />
    </main>
  );
}
