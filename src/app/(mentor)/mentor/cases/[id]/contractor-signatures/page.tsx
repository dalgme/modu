import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { requireMentor } from '@/lib/auth/guards';
import { getSupportContext, listContractorSignatures } from '@/lib/data/support-items';
import { ContractorSignatureManager } from '@/components/support/contractor-signature-manager';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  await requireMentor();
  const ctx = await getSupportContext(params.id);
  if (!ctx) notFound();

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href={`/mentor/cases/${ctx.caseId}`}>
            <ArrowLeft className="h-3.5 w-3.5" />
            케이스로 이동
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">공사업체 서명받기 · 대리</h1>
        <p className="text-sm text-muted-foreground">
          {ctx.businessName} — 현장에서 공사·납품업체 대표의 서명을 받아 등록할 수 있습니다.
        </p>
      </div>

      <ContractorSignatureManager
        caseId={ctx.caseId}
        signatures={await listContractorSignatures(ctx.caseId)}
        editable={ctx.editable}
      />
    </main>
  );
}
