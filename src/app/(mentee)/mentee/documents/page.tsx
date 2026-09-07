import { requireMentee } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMenteeCases } from '@/lib/data/cases';
import { listCaseDocuments, listRequiredDocSlots } from '@/lib/workflow/case-documents';
import { CaseDocumentsPanel } from '@/components/cases/case-documents-panel';
import { RequiredDocsPanel } from '@/components/cases/required-docs-panel';

export const dynamic = 'force-dynamic';

/** 멘티 서류 — 그룹 필수서류 슬롯 + 자유 첨부. "멘토에게 공개" 체크로 공개 범위를 정한다. */
export default async function Page() {
  const profile = await requireMentee();
  const ctx = await requireContext(profile);
  const all = await listMenteeCases(profile.id, { programId: ctx.programId });
  const cases = ctx.supportTypeId ? all.filter((c) => c.support_type_id === ctx.supportTypeId) : all;
  const data = await Promise.all(cases.map(async (c) => ({ docs: await listCaseDocuments(c.id, 'mentee'), slots: await listRequiredDocSlots(c.id, 'mentee') })));

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">내 서류</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          그룹 필수서류와 사업계획서·증빙 등 관련 서류를 올립니다. 멘토에게 보여줄 파일만 &lsquo;멘토에게 공개&rsquo;를 켜세요.
        </p>
      </div>
      {cases.length === 0 && <p className="text-sm text-muted-foreground">등록된 케이스가 없습니다.</p>}
      {cases.map((c, i) => {
        const editable = c.status !== 'closed' && c.status !== 'withdrawn';
        return (
          <section key={c.id} className="flex flex-col gap-3">
            {cases.length > 1 && <h2 className="text-base font-semibold">{c.supportTypeName ?? '-'}</h2>}
            <RequiredDocsPanel caseId={c.id} slots={data[i]?.slots ?? []} viewerRole="mentee" canUpload={editable} />
            <CaseDocumentsPanel caseId={c.id} docs={data[i]?.docs ?? []} viewerRole="mentee" canUpload={editable} />
          </section>
        );
      })}
    </main>
  );
}
