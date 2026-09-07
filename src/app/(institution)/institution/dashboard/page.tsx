import { listCases, listRecalledCases } from '@/lib/data/cases';
import { type StaffCasesSearchParams } from '@/components/cases/staff-cases-view';
import { InstitutionDashboardBody } from '@/components/institution/institution-dashboard-body';

export default async function Page({ searchParams }: { searchParams: StaffCasesSearchParams }) {
  const [cases, recalled] = await Promise.all([listCases({}), listRecalledCases()]);
  return (
    <main className="flex flex-col gap-6">
      <InstitutionDashboardBody
        cases={cases}
        recalled={recalled}
        searchParams={searchParams}
        basePath="/institution/cases"
        editBasePath="/institution/cases"
      />
    </main>
  );
}
