import { getTokenSurvey } from '@/lib/surveys/campaigns';
import { parseChoices, parseScale } from '@/lib/surveys/validate';
import { CampaignSurveyForm } from '@/components/surveys/campaign-survey-form';

export const dynamic = 'force-dynamic';

/**
 * 조사 응답 페이지 — 토큰으로 대상자를 식별하므로 로그인이 필요 없다 (문자 링크·플랫폼 내 공용).
 * 토큰이 없거나 틀리면 아무 정보도 노출하지 않는다.
 */
export default async function Page({ params, searchParams }: { params: { token: string }; searchParams: { src?: string } }) {
  const survey = await getTokenSurvey(params.token);
  const now = Date.now();
  const notStarted = survey && new Date(survey.campaign.starts_at).getTime() > now;
  const ended = survey && (survey.campaign.status !== 'open' || (survey.campaign.ends_at && new Date(survey.campaign.ends_at).getTime() < now));
  const scales: Record<string, { min: number; max: number; minLabel: string; maxLabel: string }> = {};
  const choices: Record<string, { id: string; label: string }[]> = {};
  for (const q of survey?.questions ?? []) {
    if (q.qtype === 'scale') scales[q.id] = parseScale(q);
    else if (q.qtype !== 'text') choices[q.id] = parseChoices(q);
  }
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 py-8">
      {!survey ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">유효하지 않은 조사 링크입니다. 안내 문자를 다시 확인해 주세요.</div>
      ) : (
        <>
          <header className="rounded-2xl bg-midnight p-6 text-midnight-foreground">
            <p className="text-xs text-midnight-foreground/70">{survey.programName}</p>
            <h1 className="mt-1 text-2xl font-bold">{survey.campaign.title}</h1>
            {survey.campaign.description && <p className="mt-2 text-sm text-midnight-foreground/80">{survey.campaign.description}</p>}
            <p className="mt-2 text-xs text-midnight-foreground/60">{survey.targetName} 님께 발송된 조사입니다.{survey.campaign.ends_at ? ` 마감: ${new Date(survey.campaign.ends_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })}` : ''}</p>
          </header>
          {survey.responded ? (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/50 p-10 text-center text-sm">이미 응답을 제출하셨습니다. 참여해 주셔서 감사합니다.</div>
          ) : notStarted ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">아직 시작되지 않은 조사입니다.</div>
          ) : ended ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">응답 기간이 종료된 조사입니다.</div>
          ) : (
            <CampaignSurveyForm token={params.token} questions={survey.questions} scales={scales} choices={choices} channel={searchParams.src === 'sms' ? 'sms' : 'web'} />
          )}
        </>
      )}
    </main>
  );
}
