import { requireStaff } from '@/lib/auth/guards';
import { listSupportTypesWithDocs } from '@/lib/data/support-types';
import { SupportTypeEditor } from '@/components/admin/support-type-editor';

export default async function Page() {
  await requireStaff();
  const types = await listSupportTypesWithDocs();

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">지원유형 설정</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          유형별 필수·조건부 서류와 지원한도를 관리합니다. (코드 하드코딩 없이 DB 기반)
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {types.map((t) => (
          <SupportTypeEditor
            key={t.id}
            id={t.id}
            name={t.name}
            code={t.code}
            calcMethod={t.calc_method}
            limitAmount={t.limit_amount}
            areaUnitPrice={t.area_unit_price}
            documents={t.documents.map((d) => ({
              id: d.id,
              doc_key: d.doc_key,
              doc_name: d.doc_name,
              is_required: d.is_required,
              condition: d.condition,
            }))}
          />
        ))}
      </div>
    </main>
  );
}
