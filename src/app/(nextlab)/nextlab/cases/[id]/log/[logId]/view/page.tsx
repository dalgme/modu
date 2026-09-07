import { requireNextlab } from '@/lib/auth/guards';
import { MentoringLogView } from '@/components/cases/mentoring-log-view';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function Page({ params }: { params: { id: string; logId: string } }) {
  await requireNextlab();
  return (
    <MentoringLogView
      caseId={params.id}
      logId={params.logId}
      backHref={`/nextlab/cases/${params.id}`}
      backLabel="케이스로 이동"
    />
  );
}
