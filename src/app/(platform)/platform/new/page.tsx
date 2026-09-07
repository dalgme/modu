import { listAllPrograms } from '@/lib/platform/data';
import { ProgramCreateForm } from '@/components/platform/program-create-form';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const programs = await listAllPrograms();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">행사 개설</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          발주처·용역사 기관명은 이 행사의 모든 화면·문서·알림에 반영됩니다. 기존 행사의 설정(그룹·필수서류·단가·한도·정책·만족도·보고서 양식·키워드)을 복제할 수 있으며 계정·케이스는 복제되지 않습니다.
        </p>
      </div>
      <ProgramCreateForm sources={programs.map((p) => ({ id: p.program.id, name: p.program.name }))} />
    </main>
  );
}
