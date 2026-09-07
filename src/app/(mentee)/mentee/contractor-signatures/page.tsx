import { requireMentee } from '@/lib/auth/guards';
import { getMenteeCase } from '@/lib/data/cases';
import { getSupportContext, listContractorSignatures } from '@/lib/data/support-items';
import { ContractorSignatureManager } from '@/components/support/contractor-signature-manager';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profile = await requireMentee();
  const myCase = await getMenteeCase(profile.id);
  const ctx = myCase ? await getSupportContext(myCase.id) : null;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">공사업체 서명받기</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          공사·납품업체 대표(사장님)의 서명을 현장에서 받아 등록합니다.
        </p>
      </div>

      {!ctx ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          아직 연결된 케이스가 없습니다. 운영팀의 안내를 기다려 주세요.
        </div>
      ) : (
        <ContractorSignatureManager
          caseId={ctx.caseId}
          signatures={await listContractorSignatures(ctx.caseId)}
          editable={ctx.editable}
        />
      )}
    </main>
  );
}
