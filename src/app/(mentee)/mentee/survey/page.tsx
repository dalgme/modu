import { CheckCircle2 } from 'lucide-react';

import { requireMentee } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getMenteeCase } from '@/lib/data/cases';
import { getCaseSurvey, choiceOptions, scaleOptions } from '@/lib/data/survey';
import { SURVEY_OPEN_STATUSES } from '@/lib/workflow/mentee';
import { SurveyForm } from '@/components/mentee/survey-form';
import { formatDateTime } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/** 멘티 만족도 조사 — 종결 요청 이후 1회 응답 */
export default async function Page() {
  const profile = await requireMentee();
  const ctx = await requireContext(profile);
  const c = await getMenteeCase(profile.id, { programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined });
  const survey = c ? await getCaseSurvey(c.id) : null;
  const open = !!c && (SURVEY_OPEN_STATUSES as readonly string[]).includes(c.status);

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">만족도 조사</h1>
        <p className="mt-1 text-sm text-muted-foreground">컨설팅이 마무리되면 담당 멘토와 프로그램에 대한 의견을 남겨 주세요. 응답은 운영사·발주처만 열람하며 멘토에게는 개인 응답이 공개되지 않습니다.</p>
      </div>
      {!c && <p className="text-sm text-muted-foreground">등록된 케이스가 없습니다.</p>}
      {c && !survey && <p className="text-sm text-muted-foreground">아직 준비된 만족도 양식이 없습니다.</p>}
      {c && survey && survey.response && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50/50 px-4 py-3 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" /> {formatDateTime(survey.response.submitted_at)} 에 응답을 제출했습니다. 감사합니다.
        </div>
      )}
      {c && survey && !survey.response && !open && (
        <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">만족도 조사는 멘토가 종결을 요청한 뒤에 열립니다. (현재 회차 {c.roundsDone}/{c.requiredRounds})</p>
      )}
      {c && survey && !survey.response && open && (
        <SurveyForm
          caseId={c.id}
          questions={survey.questions}
          scales={Object.fromEntries(survey.questions.filter((q) => q.qtype === 'scale').map((q) => [q.id, scaleOptions(q)]))}
          choices={Object.fromEntries(survey.questions.filter((q) => q.qtype !== 'scale' && q.qtype !== 'text').map((q) => [q.id, choiceOptions(q)]))}
        />
      )}
    </main>
  );
}
