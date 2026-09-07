import { notFound } from 'next/navigation';

import { requireMentor } from '@/lib/auth/guards';
import { getCaseById } from '@/lib/data/cases';
import { MentorCaseDetailBody } from '@/components/cases/mentor-case-detail-body';

// 붙임서식·보고서 PDF 생성(Chromium)이 콜드스타트 포함 시간이 걸릴 수 있어 타임아웃 상향
export const maxDuration = 60;

export default async function Page({ params }: { params: { id: string } }) {
  await requireMentor();
  const item = await getCaseById(params.id);
  if (!item) notFound();

  return (
    <main className="flex flex-col gap-5">
      <MentorCaseDetailBody item={item} />
    </main>
  );
}
