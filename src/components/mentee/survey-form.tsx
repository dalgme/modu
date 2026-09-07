'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';

import type { SurveyQuestion } from '@/lib/data/survey';
import { submitSurveyAction } from '@/lib/workflow/mentee-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type Answer = number | string | string[] | undefined;

/** 만족도 조사 응답 폼 — 문항 유형 5종(척도·단일·복수·주관식·순위). options 는 서버에서 파싱해 내려온다. */
export function SurveyForm({
  caseId,
  questions,
  scales,
  choices,
}: {
  caseId: string;
  questions: SurveyQuestion[];
  scales: Record<string, { min: number; max: number; minLabel: string; maxLabel: string }>;
  choices: Record<string, { id: string; label: string }[]>;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const set = (id: string, v: Answer) => setAnswers((a) => ({ ...a, [id]: v }));

  const submit = () => {
    for (const q of questions) {
      const v = answers[q.id];
      if (q.required && (v === undefined || v === '' || (Array.isArray(v) && v.length === 0))) {
        toast({ title: `필수 문항에 답해 주세요: ${q.label}`, variant: 'destructive' });
        return;
      }
    }
    if (!confirm('응답을 제출할까요? 제출 후에는 수정할 수 없습니다.')) return;
    start(async () => {
      const r = await submitSurveyAction(caseId, answers);
      toast(r.ok ? { title: '만족도 조사에 참여해 주셔서 감사합니다.' } : { title: r.error, variant: 'destructive' });
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {questions.map((q, idx) => (
        <fieldset key={q.id} className="rounded-xl border bg-background p-4 shadow-sm">
          <legend className="px-1 text-sm font-semibold">
            {idx + 1}. {q.label} {q.required && <span className="text-destructive">*</span>}
          </legend>
          {q.help && <p className="mb-2 text-xs text-muted-foreground">{q.help}</p>}
          {q.qtype === 'scale' && (
            <ScaleInput value={typeof answers[q.id] === 'number' ? (answers[q.id] as number) : undefined} onChange={(v) => set(q.id, v)} {...(scales[q.id] ?? { min: 1, max: 5, minLabel: '', maxLabel: '' })} />
          )}
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
          {q.qtype === 'rank' && <RankInput options={choices[q.id] ?? []} value={Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : []} onChange={(v) => set(q.id, v)} />}
          {q.qtype === 'text' && <Textarea rows={4} value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''} onChange={(e) => set(q.id, e.target.value)} maxLength={2000} />}
        </fieldset>
      ))}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending} className="gap-1">
          <CheckCircle2 className="h-4 w-4" /> {pending ? '제출 중…' : '응답 제출'}
        </Button>
      </div>
    </div>
  );
}

function ScaleInput({ value, onChange, min, max, minLabel, maxLabel }: { value: number | undefined; onChange: (v: number) => void; min: number; max: number; minLabel: string; maxLabel: string }) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {nums.map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} className={`h-10 w-10 rounded-full border text-sm font-semibold ${value === n ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
            {n}
          </button>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{min} = {minLabel}</span>
          <span>{max} = {maxLabel}</span>
        </div>
      )}
    </div>
  );
}

/** 순위: 클릭한 순서대로 1위, 2위… 다시 클릭하면 제외 */
function RankInput({ options, value, onChange }: { options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">중요한 순서대로 클릭하세요. 다시 클릭하면 순위에서 빠집니다.</p>
      {options.map((o) => {
        const rank = value.indexOf(o.id);
        return (
          <button key={o.id} type="button" onClick={() => onChange(rank >= 0 ? value.filter((x) => x !== o.id) : [...value, o.id])} className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm ${rank >= 0 ? 'border-primary bg-primary/10' : 'hover:bg-accent'}`}>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">{rank >= 0 ? rank + 1 : '-'}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
