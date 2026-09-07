import { requireInstitution } from '@/lib/auth/guards';
import { MentoringLogView } from '@/components/cases/mentoring-log-view';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function Page({ params }: { params: { id: string; logId: string } }) {
  await requireInstitution();
  return (
    <MentoringLogView
      caseId={params.id}
      logId={params.logId}
      backHref={`/institution/cases/${params.id}`}
      backLabel="케이스로 이동"
    />
  );
}
