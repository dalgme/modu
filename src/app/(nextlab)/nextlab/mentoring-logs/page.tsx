import { requireNextlab } from '@/lib/auth/guards';
import { listCases } from '@/lib/data/cases';
import { listMentoringLogsByCases } from '@/lib/data/mentoring-logs';
import { MentoringLogDirectory } from '@/components/cases/mentoring-log-directory';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams?: { case?: string } }) {
  await requireNextlab();
  const cases = await listCases({});
  const logsByCase = await listMentoringLogsByCases(cases.map((c) => c.id));

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">멘토링 일지 열람</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          좌측에서 멘티기업을 선택하면 회차별 멘토링 일지를 출력 원본으로 바로 확인·인쇄합니다.
        </p>
      </div>
      <MentoringLogDirectory
        cases={cases}
        logsByCase={logsByCase}
        caseHrefBase="/nextlab/cases"
        selfPath="/nextlab/mentoring-logs"
        activeId={searchParams?.case}
      />
    </main>
  );
}
