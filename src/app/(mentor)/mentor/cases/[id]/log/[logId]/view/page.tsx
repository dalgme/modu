import { requireMentor } from '@/lib/auth/guards';
import { MentoringLogView } from '@/components/cases/mentoring-log-view';

export const dynamic = 'force-dynamic';
// 서명·사진 이미지 조회 여유
export const maxDuration = 60;

export default async function Page({ params }: { params: { id: string; logId: string } }) {
  await requireMentor();
  return (
    <MentoringLogView
      caseId={params.id}
      logId={params.logId}
      backHref={`/mentor/cases/${params.id}/log`}
      backLabel="일지 목록"
      editHref={`/mentor/cases/${params.id}/log/${params.logId}/edit`}
    />
  );
}
