import type { CaseSurvey } from '@/lib/data/survey';
import { choiceOptions, scaleOptions } from '@/lib/data/survey';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';

/** 스태프용 만족도 응답 카드 (응답 없으면 미응답 표시) */
export function SurveyResultCard({ survey }: { survey: CaseSurvey | null }) {
  if (!survey) return null;
  const r = survey.response;
  const answers = (r?.answers && typeof r.answers === 'object' && !Array.isArray(r.answers) ? r.answers : {}) as Record<string, unknown>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          만족도 조사 {r ? <span className="ml-1 text-sm font-normal text-muted-foreground">평균 {r.score ?? '-'} / 응답 {formatDateTime(r.submitted_at)}</span> : <span className="ml-1 text-xs font-normal text-muted-foreground">미응답</span>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {survey.template.name} v{survey.template.version}
        </p>
      </CardHeader>
      {r && (
        <CardContent>
          <dl className="flex flex-col gap-2 text-sm">
            {survey.questions.map((q) => {
              const v = answers[q.id];
              let text = '-';
              if (q.qtype === 'scale' && typeof v === 'number') text = `${v} / ${scaleOptions(q).max}`;
              else if (q.qtype === 'single' && typeof v === 'string') text = choiceOptions(q).find((o) => o.id === v)?.label ?? v;
              else if ((q.qtype === 'multi' || q.qtype === 'rank') && Array.isArray(v)) {
                const opts = choiceOptions(q);
                text = (v as string[]).map((id, i) => `${q.qtype === 'rank' ? `${i + 1}위 ` : ''}${opts.find((o) => o.id === id)?.label ?? id}`).join(', ');
              } else if (q.qtype === 'text' && typeof v === 'string') text = v;
              return (
                <div key={q.id} className="rounded-md bg-muted/40 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{q.label}</dt>
                  <dd className="whitespace-pre-wrap">{text}</dd>
                </div>
              );
            })}
          </dl>
        </CardContent>
      )}
    </Card>
  );
}
