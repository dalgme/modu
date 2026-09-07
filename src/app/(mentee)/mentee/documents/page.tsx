import { requireMentee } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMenteeCases } from '@/lib/data/cases';
import { listCaseDocuments } from '@/lib/workflow/case-documents';
import { CaseDocumentsPanel } from '@/components/cases/case-documents-panel';

export const dynamic = 'force-dynamic';

/** 멘티 서류 첨부 — 케이스별. "멘토에게 공개" 체크로 공개 범위를 정한다. */
export default async function Page() {
  const profile = await requireMentee();
  const ctx = await requireContext(profile);
  const all = await listMenteeCases(profile.id, { programId: ctx.programId });
  const cases = ctx.supportTypeId ? all.filter((c) => c.support_type_id === ctx.supportTypeId) : all;
  const docsByCase = await Promise.all(cases.map((c) => listCaseDocuments(c.id, 'mentee')));

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">내 서류</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          사업계획서·증빙 등 관련 서류를 올립니다. 멘토에게 보여줄 파일만 &lsquo;멘토에게 공개&rsquo;를 켜세요.
        </p>
      </div>
      {cases.length === 0 && <p className="text-sm text-muted-foreground">등록된 케이스가 없습니다.</p>}
      {cases.map((c, i) => (
        <section key={c.id} className="flex flex-col gap-2">
          {cases.length > 1 && <h2 className="text-base font-semibold">{c.supportTypeName ?? '-'}</h2>}
          <CaseDocumentsPanel caseId={c.id} docs={docsByCase[i] ?? []} viewerRole="mentee" canUpload={c.status !== 'closed' && c.status !== 'withdrawn'} />
        </section>
      ))}
    </main>
  );
}
