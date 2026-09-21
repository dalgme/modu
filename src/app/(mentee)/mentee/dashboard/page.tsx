import { requireMentee } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMenteeCases } from '@/lib/data/cases';
import { listRounds } from '@/lib/data/rounds';
import { getCaseSurvey } from '@/lib/data/survey';
import { listMentorChangeRequests } from '@/lib/data/mentee';
import { listRequiredDocSlots } from '@/lib/workflow/case-documents';
import { SURVEY_OPEN_STATUSES } from '@/lib/workflow/mentee';
import { canTransition } from '@/lib/workflow/transitions';
import { resolveRoundReportPolicy } from '@/lib/documents/round-report';
import { MenteeDashboardBody } from '@/components/mentee/mentee-dashboard-body';
import { listMyOpenSurveys } from '@/lib/surveys/campaigns';
import { OpenSurveysCard } from '@/components/surveys/open-surveys-card';
import { countUnreadMessages } from '@/lib/messages/data';
import Link from 'next/link';

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
  const [rounds, survey, changeRequests, slots, policy] = primary
    ? await Promise.all([listRounds(primary.id), getCaseSurvey(primary.id), listMentorChangeRequests(primary.id), listRequiredDocSlots(primary.id, 'mentee'), resolveRoundReportPolicy(primary.program_id, primary.support_type_id)])
    : [[], null, [], [], null];
  const openSurveys = await listMyOpenSurveys(profile.id, ctx.programId);
  const pendingChange = changeRequests.find((r) => r.status === 'pending') ?? null;
  const lastDecision = changeRequests.find((r) => r.status !== 'pending') ?? null;

  const unreadMessages = await countUnreadMessages(profile.id, ctx.programId);

  return (
    <main className="flex flex-col gap-5">
      {unreadMessages > 0 && (
        <Link href="/mentee/inquiries?tab=messages" className="flex items-center justify-between gap-3 rounded-lg border border-sky-400 bg-sky-50/60 px-4 py-3 text-sm font-semibold text-sky-900 hover:bg-sky-50">
          <span>🔔 담당 멘토가 보낸 새 메시지 {unreadMessages}건</span>
          <span className="underline-offset-4">메시지 확인 →</span>
        </Link>
      )}
      {openSurveys.length > 0 && <div className="mb-4"><OpenSurveysCard surveys={openSurveys} /></div>}
      <MenteeDashboardBody
        name={profile.name}
        cases={cases}
        branding={ctx.branding}
        todo={
          primary
            ? {
                unsignedRounds: policy?.menteeConfirmSignature ? rounds.filter((r) => !r.mentee_signed_at).length : 0,
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
