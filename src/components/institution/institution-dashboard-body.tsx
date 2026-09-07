import type { CaseListItem } from '@/lib/data/cases';
import type { Branding } from '@/lib/programs/branding';
import { fmt } from '@/lib/programs/branding';
import { CaseActionQueue } from '@/components/cases/case-action-queue';
import { CaseStats } from '@/components/cases/case-stats';
import { CaseTable } from '@/components/cases/case-table';
import { OperatorRequestGeneralButton } from '@/components/cases/operator-request-general-button';

/** 발주처 대시보드 본문 — 열람 중심. 정산 확인(T9)은 P4 에서 붙는다. */
export function InstitutionDashboardBody({
  cases,
  basePath,
  branding,
  groupName,
}: {
  cases: CaseListItem[];
  basePath: string;
  branding: Branding;
  groupName: string | null;
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

      <CaseActionQueue
        title="정산 확인 대기 (지급 품의)"
        description={fmt('{operator}가 제출한 지급 품의입니다. 확인하면 케이스가 종결됩니다. (P4 에서 열립니다)', branding)}
        items={cases.filter((c) => c.status === 'settlement_batched')}
        basePath={basePath}
        ctaLabel="확인"
        emptyText="확인 대기 건이 없습니다."
        branding={branding}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">케이스 진행현황</h2>
        <CaseTable items={cases} basePath={basePath} branding={branding} showGroup={!groupName} />
      </div>
    </div>
  );
}
