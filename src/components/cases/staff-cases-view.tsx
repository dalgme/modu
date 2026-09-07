import {
  listCases,
  listSupportTypes,
  listMentors,
  type CaseFilters,
  type CaseListItem,
} from '@/lib/data/cases';
import { CASE_STATUSES, type CaseStatus } from '@/types/case-status';
import { CaseStats } from '@/components/cases/case-stats';
import { CaseFilters as CaseFilterBar } from '@/components/cases/case-filters';
import { CaseTable } from '@/components/cases/case-table';
import { getManuallyReceivedCaseIds } from '@/lib/data/case-flags';
import { getActiveEditGrantCaseIds } from '@/lib/data/edit-grants';
import { getMentoringRoundCounts } from '@/lib/data/mentoring-logs';

export interface StaffCasesSearchParams {
  type?: string;
  status?: string;
  mentor?: string;
  from?: string;
  to?: string;
}

function toStatus(value: string | undefined): CaseStatus | undefined {
  return value && (CASE_STATUSES as readonly string[]).includes(value)
    ? (value as CaseStatus)
    : undefined;
}

/**
 * 진흥원·넥스트랩 공통 케이스 조회 뷰 (통계 + 필터 + 테이블).
 * items 를 넘기면 필터가 없을 때 재조회 없이 재사용한다 (대시보드에서 listCases 1회 공유).
 */
export async function StaffCasesView({
  basePath,
  searchParams,
  items: preItems,
}: {
  basePath: string;
  searchParams: StaffCasesSearchParams;
  items?: CaseListItem[];
}) {
  const filters: CaseFilters = {
    supportTypeId: searchParams.type,
    status: toStatus(searchParams.status),
    mentorId: searchParams.mentor,
    from: searchParams.from,
    to: searchParams.to ? `${searchParams.to}T23:59:59` : undefined,
  };
  const hasFilters = !!(
    searchParams.type ||
    searchParams.status ||
    searchParams.mentor ||
    searchParams.from ||
    searchParams.to
  );

  const [items, supportTypes, mentors] = await Promise.all([
    !hasFilters && preItems ? Promise.resolve(preItems) : listCases(filters),
    listSupportTypes(),
    listMentors(),
  ]);
  const ids = items.map((c) => c.id);
  const [manuallyReceivedIds, editGrantCaseIds, roundCounts] = await Promise.all([
    getManuallyReceivedCaseIds(ids),
    getActiveEditGrantCaseIds(ids),
    getMentoringRoundCounts(ids),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <CaseStats items={items} />
      <CaseFilterBar
        supportTypes={supportTypes.map((t) => ({ id: t.id, name: t.name }))}
        mentors={mentors}
      />
      <CaseTable
        items={items}
        basePath={basePath}
        manuallyReceivedIds={manuallyReceivedIds}
        editGrantCaseIds={editGrantCaseIds}
        roundCounts={roundCounts}
      />
    </div>
  );
}
