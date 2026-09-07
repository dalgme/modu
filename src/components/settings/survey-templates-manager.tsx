'use client';

import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react';

import type { SurveyTemplateWithQuestions } from '@/lib/settings/data';
import { saveSurveyTemplateAction, toggleSurveyTemplateAction } from '@/lib/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface Q {
  qtype: 'scale' | 'single' | 'multi' | 'text' | 'rank';
  label: string;
  help: string;
  required: boolean;
  options: string;
  scaleMin: number;
  scaleMax: number;
  minLabel: string;
  maxLabel: string;
}
const QTYPE_LABEL: Record<Q['qtype'], string> = { scale: '척도', single: '단일 선택', multi: '복수 선택', text: '주관식', rank: '순위' };
const EMPTY_Q: Q = { qtype: 'scale', label: '', help: '', required: true, options: '', scaleMin: 1, scaleMax: 5, minLabel: '매우 불만족', maxLabel: '매우 만족' };

function fromTemplate(t: SurveyTemplateWithQuestions): Q[] {
  return t.questions.map((q) => {
    const o = q.options;
    const isArr = Array.isArray(o);
    const sc = (!isArr && o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
    return {
      qtype: q.qtype as Q['qtype'],
      label: q.label,
      help: q.help ?? '',
      required: q.required,
      options: isArr ? (o as unknown[]).map((v) => (typeof v === 'string' ? v : String((v as { label?: string }).label ?? ''))).join('\n') : '',
      scaleMin: Number(sc.min ?? 1),
      scaleMax: Number(sc.max ?? 5),
      minLabel: String(sc.min_label ?? ''),
      maxLabel: String(sc.max_label ?? ''),
    };
  });
}

/** 만족도 양식 관리 — 응답이 생기면 잠금, 수정은 새 버전으로 */
export function SurveyTemplatesManager({ templates, groups }: { templates: SurveyTemplateWithQuestions[]; groups: { id: string; name: string }[] }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [baseId, setBaseId] = useState<string | undefined>();
  const [scope, setScope] = useState('');
  const [name, setName] = useState('표준 만족도 조사');
  const [qs, setQs] = useState<Q[]>([{ ...EMPTY_Q }]);

  const startNew = (t?: SurveyTemplateWithQuestions) => {
    setBaseId(t?.id);
    setScope(t?.support_type_id ?? '');
    setName(t?.name ?? '표준 만족도 조사');
    setQs(t ? fromTemplate(t) : [{ ...EMPTY_Q }]);
    setOpen(true);
  };
  const setQ = (i: number, patch: Partial<Q>) => setQs((a) => a.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) => setQs((a) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j]!, b[i]!]; return b; });

  const submit = () =>
    start(async () => {
      const r = await saveSurveyTemplateAction({
        base_id: baseId,
        support_type_id: scope,
        name,
        questions: qs.map((q) => ({
          qtype: q.qtype,
          label: q.label,
          help: q.help,
          required: q.required,
          options: q.qtype === 'single' || q.qtype === 'multi' || q.qtype === 'rank' ? q.options.split('\n').map((s) => s.trim()).filter(Boolean) : undefined,
          scale: q.qtype === 'scale' ? { min: q.scaleMin, max: q.scaleMax, min_label: q.minLabel, max_label: q.maxLabel } : undefined,
        })),
      });
      toast(r.ok ? { title: '새 버전을 저장하고 활성화했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) setOpen(false);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1" onClick={() => (open ? setOpen(false) : startNew())} disabled={pending}>
          <Plus className="h-4 w-4" /> 새 양식
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-muted/20 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label>적용 범위</Label>
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" disabled={!!baseId}>
                <option value="">행사 공통</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    그룹: {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>양식 이름</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          {qs.map((q, i) => (
            <div key={i} className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-[auto_1fr_auto]">
              <div className="flex flex-col gap-1">
                <select value={q.qtype} onChange={(e) => setQ(i, { qtype: e.target.value as Q['qtype'] })} className="h-9 rounded-md border bg-background px-2 text-sm">
                  {(Object.keys(QTYPE_LABEL) as Q['qtype'][]).map((k) => (
                    <option key={k} value={k}>
                      {QTYPE_LABEL[k]}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} /> 필수</label>
              </div>
              <div className="flex flex-col gap-1">
                <Input value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} placeholder={`${i + 1}. 문항 내용`} />
                <Input value={q.help} onChange={(e) => setQ(i, { help: e.target.value })} placeholder="도움말 (선택)" className="text-xs" />
                {q.qtype === 'scale' && (
                  <div className="grid grid-cols-4 gap-1">
                    <Input type="number" value={q.scaleMin} onChange={(e) => setQ(i, { scaleMin: Number(e.target.value) })} placeholder="min" />
                    <Input type="number" value={q.scaleMax} onChange={(e) => setQ(i, { scaleMax: Number(e.target.value) })} placeholder="max" />
                    <Input value={q.minLabel} onChange={(e) => setQ(i, { minLabel: e.target.value })} placeholder="최소 라벨" />
                    <Input value={q.maxLabel} onChange={(e) => setQ(i, { maxLabel: e.target.value })} placeholder="최대 라벨" />
                  </div>
                )}
                {(q.qtype === 'single' || q.qtype === 'multi' || q.qtype === 'rank') && (
                  <textarea value={q.options} onChange={(e) => setQ(i, { options: e.target.value })} rows={3} placeholder="보기를 한 줄에 하나씩" className="rounded-md border bg-background px-2 py-1 text-sm" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setQs((a) => a.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          <div className="flex justify-between">
            <Button type="button" size="sm" variant="outline" onClick={() => setQs((a) => [...a, { ...EMPTY_Q }])}>
              문항 추가
            </Button>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소</Button>
              <Button type="button" size="sm" onClick={submit} disabled={pending}>{baseId ? '새 버전으로 저장' : '저장·활성화'}</Button>
            </div>
          </div>
        </div>
      )}
      {templates.map((t) => (
        <section key={t.id} className="rounded-xl border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>
              <b>{t.name}</b> v{t.version} · {t.support_type_id ? `그룹: ${groups.find((g) => g.id === t.support_type_id)?.name ?? '?'}` : '행사 공통'} · 문항 {t.questions.length} · 응답 {t.responseCount}
              {t.locked_at && <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> 잠금(응답 있음)</span>}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${t.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>{t.is_active ? '활성' : '비활성'}</span>
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => startNew(t)} disabled={pending}>
                {t.locked_at ? '복제해 새 버전' : '수정(새 버전)'}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await toggleSurveyTemplateAction(t.id, !t.is_active); toast(r.ok ? { title: '변경했습니다.' } : { title: r.error, variant: 'destructive' }); })}>
                {t.is_active ? '비활성화' : '활성화'}
              </Button>
            </div>
          </div>
          <ol className="mt-2 list-decimal pl-5 text-xs text-muted-foreground">
            {t.questions.map((q) => (
              <li key={q.id}>
                [{QTYPE_LABEL[q.qtype as Q['qtype']]}] {q.label} {q.required ? '' : '(선택)'}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
