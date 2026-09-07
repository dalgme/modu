import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Pencil, ArrowLeft } from 'lucide-react';

import { getCaseById } from '@/lib/data/cases';
import { listMentoringLogs, getMentoringPhotoUrlsByLog } from '@/lib/data/mentoring-logs';
import { getCaseSignatureImages } from '@/lib/data/signatures';
import { MentoringLogDocument } from '@/components/cases/mentoring-log-document';
import { PrintButton } from '@/components/common/print-button';
import { Button } from '@/components/ui/button';

/**
 * 멘토링 일지 '출력 원본' 뷰 (멘토·진흥원·넥스트랩 공용).
 * 페이지에서 역할 가드(requireMentor/requireInstitution/requireNextlab) 후 호출한다.
 * @param backHref 목록/상세로 돌아가는 링크
 * @param editHref 수정 링크(멘토만 전달, 운영진은 생략 → 읽기 전용)
 */
export async function MentoringLogView({
  caseId,
  logId,
  backHref,
  backLabel = '뒤로',
  editHref,
}: {
  caseId: string;
  logId: string;
  backHref: string;
  backLabel?: string;
  editHref?: string;
}) {
  const item = await getCaseById(caseId);
  if (!item) notFound();

  const logs = await listMentoringLogs(item.id);
  const idx = logs.findIndex((l) => l.id === logId);
  const log = logs[idx];
  if (!log) notFound();

  const [sigs, photos] = await Promise.all([
    getCaseSignatureImages(item.id),
    getMentoringPhotoUrlsByLog(item.id, logId),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
        <div className="flex gap-2">
          {editHref && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={editHref}>
                <Pencil className="h-4 w-4" />
                수정
              </Link>
            </Button>
          )}
          <PrintButton />
        </div>
      </div>

      <MentoringLogDocument
        round={idx + 1}
        businessName={item.business_name}
        ownerName={item.owner_name}
        mentorName={item.mentorName}
        log={log}
        mentorSig={sigs.consultant}
        menteeSig={sigs.applicant}
        photos={photos}
      />
    </main>
  );
}
