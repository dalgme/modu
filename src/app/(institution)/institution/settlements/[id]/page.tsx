import { notFound } from 'next/navigation';

import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getBatch } from '@/lib/data/settlements';
import { BatchDetail } from '@/components/settlement/batch-detail';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const found = await getBatch(params.id, ctx.programId);
  // (2026-11-16) 발주처 [정산 품의] 기능이 켜진 라운드의 품의만 발주처에 보인다
  if (!found || found.batch.status === 'draft' || found.batch.confirmer !== 'institution') notFound();
  return (
    <main>
      <BatchDetail batch={found.batch} items={found.items} role="institution" caseHrefBase="/institution/cases" backHref="/institution/settlements" />
    </main>
  );
}
