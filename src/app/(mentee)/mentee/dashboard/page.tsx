import { requireMentee } from '@/lib/auth/guards';
import { getMenteeCase } from '@/lib/data/cases';
import { getMenteeSubmissionSummary } from '@/lib/data/mentee-progress';
import { listOpenSupplementRequests } from '@/lib/data/supplement-requests';
import { MenteeDashboardBody } from '@/components/mentee/mentee-dashboard-body';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profile = await requireMentee();
  const myCase = await getMenteeCase(profile.id);
  const [summary, supplements] = myCase
    ? await Promise.all([
        getMenteeSubmissionSummary(myCase.id),
        listOpenSupplementRequests(myCase.id),
      ])
    : [null, []];

  return (
    <main className="flex flex-col gap-5">
      <MenteeDashboardBody
        name={profile.name}
        myCase={myCase}
        summary={summary}
        supplements={supplements}
      />
    </main>
  );
}
