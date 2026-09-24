import Link from 'next/link';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { isPL } from '@/lib/auth/capabilities';
import { listSummarySnapshots } from '@/lib/reports/summary';
import { SummarySnapshotsPanel } from '@/components/reports/summary-snapshots-panel';

export const dynamic = 'force-dynamic';

/** 종합결과리포트 — 생성일 기준 고정 스냅샷 목록·생성·내보내기 (운영사 전원, 옵저버 포함). (P31) 대상 구분 · PL 제목 변경·숨김 */
export default async function Page({ searchParams }: { searchParams: { hidden?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const canManage = isPL(ctx.grade);
  const showHidden = canManage && searchParams.hidden === '1';
  const all = await listSummarySnapshots(ctx.programId, ctx.supportTypeId ?? null, { includeHidden: showHidden });
  const snapshots = showHidden ? all.filter((s) => s.hidden) : all;
  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">종합결과리포트</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ctx.program.name}{ctx.group ? ` · ${ctx.group.name}` : ' · 행사 전체'} — 생성 시점의 데이터를 고정한 스냅샷입니다. 옵저버를 포함한 운영사 전원이 생성·열람할 수 있고, HTML·PDF·Word·Excel·PowerPoint 로 저장합니다.
          </p>
        </div>
        {canManage && (
          <Link href={showHidden ? '/nextlab/reports/summary' : '/nextlab/reports/summary?hidden=1'} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
            {showHidden ? '← 목록으로' : '숨긴 리포트 보기'}
          </Link>
        )}
      </div>
      <SummarySnapshotsPanel snapshots={snapshots} canManage={canManage} showHidden={showHidden} />
    </main>
  );
}
