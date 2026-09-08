'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';

import type { Tables } from '@/types/database';
import { respondCampaignAction } from '@/lib/surveys/campaign-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Q = Tables<'survey_questions'>;
type Answer = number | string | string[] | undefined;

/** 조사 응답 폼 (토큰 기반, 로그인 불필요) — 문항 5종. 만족도 폼과 같은 렌더 규칙 */
export function CampaignSurveyForm({ token, questions, scales, choices, channel }: { token: string; questions: Q[]; scales: Record<string, { min: number; max: number; minLabel: string; maxLabel: string }>; choices: Record<string, { id: string; label: string }[]>; channel: 'web' | 'sms' }) {
  const [pending, start] = useTransition();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (id: string, v: Answer) => setAnswers((a) => ({ ...a, [id]: v }));

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50/50 p-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <p className="text-lg font-semibold">응답이 제출되었습니다</p>
        <p className="text-sm text-muted-foreground">참여해 주셔서 감사합니다. 이 창을 닫으셔도 됩니다.</p>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    for (const q of questions) {
      const v = answers[q.id];
      if (q.required && (v === undefined || v === '' || (Array.isArray(v) && v.length === 0))) {
        setError(`필수 문항에 답해 주세요: ${q.label}`);
        return;
      }
    }
    start(async () => {
      const r = await respondCampaignAction(token, answers, channel);
      if (r.ok) setDone(true);
      else setError(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {questions.map((q, idx) => (
        <fieldset key={q.id} className="rounded-xl border bg-background p-4 shadow-sm">
          <legend className="px-1 text-sm font-semibold">
            {idx + 1}. {q.label} {q.required && <span className="text-destructive">*</span>}
          </legend>
          {q.help && <p className="mb-2 text-xs text-muted-foreground">{q.help}</p>}
          {q.qtype === 'scale' && (() => {
            const s = scales[q.id] ?? { min: 1, max: 5, minLabel: '', maxLabel: '' };
            const nums = Array.from({ length: s.max - s.min + 1 }, (_, i) => s.min + i);
            return (
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap gap-2">
                  {nums.map((n) => (
                    <button key={n} type="button" onClick={() => set(q.id, n)} className={`h-10 w-10 rounded-full border text-sm font-semibold ${answers[q.id] === n ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{n}</button>
                  ))}
                </div>
                {(s.minLabel || s.maxLabel) && (
                  <div className="flex justify-between text-[11px] text-muted-foreground"><span>{s.min} = {s.minLabel}</span><span>{s.max} = {s.maxLabel}</span></div>
                )}
              </div>
            );
          })()}
          {q.qtype === 'single' && (
            <div className="flex flex-col gap-1">
              {(choices[q.id] ?? []).map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={q.id} checked={answers[q.id] === o.id} onChange={() => set(q.id, o.id)} /> {o.label}
                </label>
              ))}
            </div>
          )}
          {q.qtype === 'multi' && (
            <div className="flex flex-col gap-1">
              {(choices[q.id] ?? []).map((o) => {
                const cur = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                return (
                  <label key={o.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={cur.includes(o.id)} onChange={(e) => set(q.id, e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id))} /> {o.label}
                  </label>
                );
              })}
            </div>
          )}
          {q.qtype === 'rank' && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">중요한 순서대로 클릭하세요. 다시 클릭하면 순위에서 빠집니다.</p>
              {(choices[q.id] ?? []).map((o) => {
                const cur = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                const rank = cur.indexOf(o.id);
                return (
                  <button key={o.id} type="button" onClick={() => set(q.id, rank >= 0 ? cur.filter((x) => x !== o.id) : [...cur, o.id])} className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm ${rank >= 0 ? 'border-primary bg-primary/10' : 'hover:bg-accent'}`}>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${rank >= 0 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{rank >= 0 ? rank + 1 : ''}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}
          {q.qtype === 'text' && <Textarea rows={4} value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''} onChange={(e) => set(q.id, e.target.value)} maxLength={2000} />}
        </fieldset>
      ))}
      {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending} className="gap-1">
          <CheckCircle2 className="h-4 w-4" /> {pending ? '제출 중…' : '응답 제출'}
        </Button>
      </div>
    </div>
  );
}
