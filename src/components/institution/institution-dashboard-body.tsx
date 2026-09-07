import type { CaseListItem } from '@/lib/data/cases';
import type { Branding } from '@/lib/programs/branding';
import { fmt } from '@/lib/programs/branding';
import { CaseActionQueue } from '@/components/cases/case-action-queue';
import { CaseStats } from '@/components/cases/case-stats';
import { CaseTable } from '@/components/cases/case-table';
import Link from 'next/link';

import { OperatorRequestGeneralButton } from '@/components/cases/operator-request-general-button';

/** 발주처 대시보드 본문 — 열람 + 정산 확인(T9) 진입 */
export function InstitutionDashboardBody({
  cases,
  basePath,
  branding,
  groupName,
  pendingBatches = 0,
}: {
  cases: CaseListItem[];
  basePath: string;
  branding: Branding;
  groupName: string | null;
  pendingBatches?: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{fmt('{client} 대시보드', branding)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {groupName ? `${groupName} ` : '행사 전체 '}진행현황 · 정산 확인.
          </p>
        </div>
        <OperatorRequestGeneralButton />
      </div>

      <CaseStats items={cases} />

      {pendingBatches > 0 && (
        <Link href="/institution/settlements" className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/50 px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-50">
          <span>{fmt('{operator}가 제출한 지급 품의 ', branding)}{pendingBatches}건이 정산 확인을 기다립니다.</span>
          <span className="underline-offset-4">정산 확인으로 이동 →</span>
        </Link>
      )}
      <CaseActionQueue
        title="지급 품의 편성 케이스"
        description={fmt('{operator}가 지급 품의에 편성한 케이스입니다. 정산 확인 메뉴에서 품의 단위로 확인하면 종결됩니다.', branding)}
        items={cases.filter((c) => c.status === 'settlement_batched')}
        basePath={basePath}
        ctaLabel="열람"
        emptyText="편성된 케이스가 없습니다."
        branding={branding}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">케이스 진행현황</h2>
        <CaseTable items={cases} basePath={basePath} branding={branding} showGroup={!groupName} />
      </div>
    </div>
  );
}
