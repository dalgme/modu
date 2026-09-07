import { notFound } from 'next/navigation';

// 신청서·보고서 PDF 열람(Chromium) 여유
export const maxDuration = 60;

import { requireNextlab } from '@/lib/auth/guards';
import { getMemberById } from '@/lib/data/members';
import { ViewAsCaseDetail } from '@/components/nextlab/view-as-case-detail';
import { ViewAsShell } from '@/components/nextlab/view-as-shell';

export default async function Page({ params }: { params: { userId: string; caseId: string } }) {
  await requireNextlab();
  const target = await getMemberById(params.userId);
  if (!target) notFound();

  return (
    <main className="flex flex-col gap-5">
      <ViewAsShell target={target} />
      <ViewAsCaseDetail target={target} caseId={params.caseId} />
    </main>
  );
}
