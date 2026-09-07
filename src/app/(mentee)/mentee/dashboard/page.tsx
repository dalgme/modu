import { requireMentee } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMenteeCases } from '@/lib/data/cases';
import { listRounds } from '@/lib/data/rounds';
import { getCaseSurvey } from '@/lib/data/survey';
import { listMentorChangeRequests } from '@/lib/data/mentee';
import { listRequiredDocSlots } from '@/lib/workflow/case-documents';
import { SURVEY_OPEN_STATUSES } from '@/lib/workflow/mentee';
import { canTransition } from '@/lib/workflow/transitions';
import { MenteeDashboardBody } from '@/components/mentee/mentee-dashboard-body';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profile = await requireMentee();
  const ctx = await requireContext(profile);
  // 그룹 컨텍스트가 있으면 그 그룹 케이스를 먼저, 나머지 행사 내 케이스는 이력으로
  const all = await listMenteeCases(profile.id, { programId: ctx.programId });
  const cases = ctx.supportTypeId
    ? [...all.filter((c) => c.support_type_id === ctx.supportTypeId), ...all.filter((c) => c.support_type_id !== ctx.supportTypeId)]
    : all;
  const primary = cases[0] ?? null;
  const [rounds, survey, changeRequests, slots] = primary
    ? await Promise.all([listRounds(primary.id), getCaseSurvey(primary.id), listMentorChangeRequests(primary.id), listRequiredDocSlots(primary.id, 'mentee')])
    : [[], null, [], []];
  const pendingChange = changeRequests.find((r) => r.status === 'pending') ?? null;
  const lastDecision = changeRequests.find((r) => r.status !== 'pending') ?? null;

  return (
    <main className="flex flex-col gap-5">
      <MenteeDashboardBody
        name={profile.name}
        cases={cases}
        branding={ctx.branding}
        todo={
          primary
            ? {
                unsignedRounds: rounds.filter((r) => !r.mentee_signed_at).length,
                surveyOpen: !!survey && !survey.response && (SURVEY_OPEN_STATUSES as readonly string[]).includes(primary.status),
                surveyDone: !!survey?.response,
                missingDocs: slots.filter((s) => s.required && s.forRole === 'mentee' && s.files.length === 0).map((s) => s.name),
                canRequestChange: primary.mentorId !== null && canTransition('reassign_mentor', primary.status),
                pendingChange: pendingChange ? { created_at: pendingChange.created_at, reason: pendingChange.reason } : null,
                lastDecision: lastDecision ? { status: lastDecision.status, handled_at: lastDecision.handled_at, handling_note: lastDecision.handling_note } : null,
              }
            : null
        }
      />
    </main>
  );
}
