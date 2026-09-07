import { notFound } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getCaseById, getCaseStatusHistory, listMentorsForProgram, listPredecessorCases } from '@/lib/data/cases';
import { canTransition } from '@/lib/workflow/transitions';
import { CaseDetailShell } from '@/components/cases/case-detail-shell';
import { CaseDetailBackNav } from '@/components/cases/case-detail-back-nav';
import { MentorAssignPanel } from '@/components/cases/mentor-assign-panel';
import { MenteeInvitePanel } from '@/components/cases/mentee-invite-panel';

export const maxDuration = 60;

export default async function Page({ params }: { params: { id: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const item = await getCaseById(params.id);
  if (!item || item.program_id !== ctx.programId) notFound();

  const [history, predecessors, mentors] = await Promise.all([
    getCaseStatusHistory(item.id),
    listPredecessorCases(item.id),
    listMentorsForProgram(ctx.programId, item.support_type_id),
  ]);

  return (
    <main className="flex flex-col gap-5">
      <CaseDetailBackNav dashboardHref="/nextlab/dashboard" />
      <CaseDetailShell
        item={item}
        history={history}
        predecessors={predecessors}
        branding={ctx.branding}
        basePath="/nextlab/cases"
        showLoginId
      >
        <MenteeInvitePanel
          caseId={item.id}
          menteeLinked={!!item.mentee_id}
          defaultName={item.owner_name}
          defaultPhone={item.phone}
          defaultEmail={item.email}
        />
        <MentorAssignPanel
          caseId={item.id}
          mentors={mentors.map((m) => ({ id: m.id, name: m.inGroup ? m.name : `${m.name} (그룹 외)` }))}
          assignable={canTransition('assign_mentor', item.status)}
          currentMentorName={item.mentorName}
          currentMentorId={item.mentorId}
          reassignable={item.mentorId !== null && canTransition('reassign_mentor', item.status)}
        />
      </CaseDetailShell>
    </main>
  );
}
