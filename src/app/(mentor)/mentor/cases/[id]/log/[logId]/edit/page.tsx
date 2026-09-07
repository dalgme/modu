import { notFound } from 'next/navigation';

import { requireMentor } from '@/lib/auth/guards';
import { getCaseById } from '@/lib/data/cases';
import { listMentoringLogs, getMentoringPhotoUrlsByLog } from '@/lib/data/mentoring-logs';
import { getCaseSignatureImages } from '@/lib/data/signatures';
import { MentoringLogForm } from '@/components/cases/mentoring-log-form';
import { CaseDetailBackNav } from '@/components/cases/case-detail-back-nav';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function Page({ params }: { params: { id: string; logId: string } }) {
  await requireMentor();
  const item = await getCaseById(params.id);
  if (!item) notFound();

  const logs = await listMentoringLogs(item.id);
  const idx = logs.findIndex((l) => l.id === params.logId);
  const existing = logs[idx];
  if (!existing) notFound();

  const [sigs, photos] = await Promise.all([
    getCaseSignatureImages(item.id),
    getMentoringPhotoUrlsByLog(item.id, params.logId),
  ]);

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">멘토링 일지 수정 ({idx + 1}회차)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.business_name} · 내용을 수정하고, 필요하면 서명·사진을 다시 올릴 수 있습니다.
        </p>
      </div>
      <MentoringLogForm
        caseId={item.id}
        existing={existing}
        currentMentorSig={sigs.consultant}
        currentMenteeSig={sigs.applicant}
        currentPhotos={photos}
      />
      <CaseDetailBackNav dashboardHref="/mentor/dashboard" />
    </main>
  );
}
