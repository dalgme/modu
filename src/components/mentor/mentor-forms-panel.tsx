'use client';

import { useRef, useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileUp } from 'lucide-react';

import {
  submitMentorFormWebAction,
  submitMentorFormFileAction,
  type MentorFormActionState,
} from '@/lib/mentor-forms/actions';
import {
  APPOINTMENT_FIELDS,
  FORM_LABELS,
  METHOD_LABELS,
  PRECHECK_QUESTIONS,
  PRIVACY_QUESTIONS,
  type MentorFormKey,
  type MentorFormMethod,
} from '@/lib/mentor-forms/defs';
import { stageUpload } from '@/lib/storage/browser-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

export interface MentorFormView {
  formKey: MentorFormKey;
  method: MentorFormMethod;
  /** 브랜딩 치환이 끝난 제목·본문 */
  title: string;
  content: string;
  submittedAt: string | null;
  submittedMethod: MentorFormMethod | null;
  fileName: string | null;
  /** 인적사항 기본값 (위촉 동의서) */
  defaults: { organization: string; position: string };
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '제출 중…' : label}
    </Button>
  );
}

function RadioPair({ name, options }: { name: string; options: { value: string; label: string }[] }) {
  return (
    <div className="flex gap-4">
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input type="radio" name={name} value={o.value} required /> {o.label}
        </label>
      ))}
    </div>
  );
}

/** 웹 작성 제출 폼 — 본문(운영사 편집 내용) + 서식별 고정 문항 + 전자서명(성명) */
function WebForm({ form }: { form: MentorFormView }) {
  const [state, action] = useFormState<MentorFormActionState, FormData>(submitMentorFormWebAction, undefined);
  const [agreed, setAgreed] = useState(false);
  const needsAgree = form.formKey === 'appointment' || form.formKey === 'pledge';
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="formKey" value={form.formKey} />
      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm leading-relaxed">{form.content}</div>

      {form.formKey === 'appointment' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {APPOINTMENT_FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <Label className="text-xs" htmlFor={`f-${f.key}`}>{f.label} *</Label>
              <Input
                id={`f-${f.key}`}
                name={`field_${f.key}`}
                defaultValue={f.key === 'organization' ? form.defaults.organization : f.key === 'position' ? form.defaults.position : ''}
                className="h-9 text-sm"
                required
              />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor="f-rrn">주민등록번호 *</Label>
            <Input id="f-rrn" name="rrn" className="h-9 text-sm" placeholder="000000-0000000" required autoComplete="off" inputMode="numeric" />
            <p className="text-[11px] text-muted-foreground">수당 지급·소득신고 목적으로만 암호화되어 보관됩니다.</p>
          </div>
        </div>
      )}

      {form.formKey === 'privacy' && (
        <div className="flex flex-col gap-3">
          {PRIVACY_QUESTIONS.map((q) => (
            <div key={q.key} className="flex flex-col gap-1 rounded-md border p-3">
              <p className="text-sm font-medium">{q.label}</p>
              <RadioPair name={`consent_${q.key}`} options={[{ value: 'yes', label: '동의함' }, { value: 'no', label: '동의하지 않음' }]} />
            </div>
          ))}
        </div>
      )}

      {form.formKey === 'precheck' && (
        <div className="flex flex-col gap-3">
          {PRECHECK_QUESTIONS.map((q) => (
            <PrecheckQuestion key={q.key} q={q} />
          ))}
        </div>
      )}

      {needsAgree && (
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
          <span>{form.formKey === 'pledge' ? '위 내용을 모두 확인하였으며, 이를 준수할 것을 서약합니다.' : '위 내용을 모두 확인하였으며, 책임멘토 위촉에 동의합니다.'}</span>
        </label>
      )}
      <input type="hidden" name="agreed" value={agreed ? 'true' : 'false'} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor={`sign-${form.formKey}`}>서명 (성명 입력) *</Label>
          <Input id={`sign-${form.formKey}`} name="signedName" className="h-9 w-40 text-sm" required placeholder="홍길동" />
        </div>
        <Submit label="동의·제출" />
      </div>
      {state?.ok === false && <p className="text-sm font-medium text-destructive">{state.error}</p>}
    </form>
  );
}

function PrecheckQuestion({ q }: { q: (typeof PRECHECK_QUESTIONS)[number] }) {
  const [answer, setAnswer] = useState<'none' | 'exists' | ''>('');
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm font-medium">{q.label}</p>
      {q.hint && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{q.hint}</p>}
      <div className="flex gap-4">
        {([['none', '해당 없음'], ['exists', '해당 있음']] as const).map(([v, label]) => (
          <label key={v} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input type="radio" name={`check_${q.key}`} value={v} required checked={answer === v} onChange={() => setAnswer(v)} /> {label}
          </label>
        ))}
      </div>
      {answer === 'exists' && (
        <textarea name={`detail_${q.key}`} rows={2} required className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" placeholder={q.detail} />
      )}
    </div>
  );
}

/** 파일 첨부 제출 — 본문(안내) 열람 후 작성한 파일 업로드 */
function FileForm({ form }: { form: MentorFormView }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return toast({ title: '파일을 선택하세요.', variant: 'destructive' });
    start(async () => {
      try {
        const staged = await stageUpload(f, 'documents');
        const r = await submitMentorFormFileAction({ formKey: form.formKey, stagingPath: staged.stagingPath, fileName: f.name });
        if (!r?.ok) {
          toast({ title: r?.ok === false ? r.error : '제출 실패', variant: 'destructive' });
          return;
        }
        toast({ title: r.message });
        router.refresh();
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : '업로드 실패', variant: 'destructive' });
      }
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm leading-relaxed">{form.content}</div>
      <p className="text-xs text-muted-foreground">위 내용의 서식을 작성·서명한 파일(PDF·HWP·이미지 등)을 첨부해 제출하세요.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input ref={fileRef} type="file" accept=".pdf,.hwp,.hwpx,.doc,.docx,.png,.jpg,.jpeg" className="max-w-xs" />
        <Button onClick={submit} disabled={pending} className="gap-1">
          <FileUp className="h-4 w-4" /> {pending ? '업로드 중…' : '파일 제출'}
        </Button>
      </div>
    </div>
  );
}

/** 멘토 위촉 서류 — 행사에서 사용 중인 서식 목록 + 제출 */
export function MentorFormsPanel({ forms }: { forms: MentorFormView[] }) {
  const [openKey, setOpenKey] = useState<MentorFormKey | null>(null);
  if (forms.length === 0) {
    return <p className="text-sm text-muted-foreground">이 행사에서 제출할 위촉 서류가 없습니다.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {forms.map((form) => {
        const done = !!form.submittedAt;
        const open = openKey === form.formKey;
        return (
          <Card key={form.formKey} className={done ? 'border-emerald-200' : 'border-amber-300'}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {form.title || FORM_LABELS[form.formKey]}
                  {done ? (
                    <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                      <CheckCircle2 className="h-3 w-3" /> 제출 완료
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">미제출</Badge>
                  )}
                  <span className="text-xs font-normal text-muted-foreground">· {METHOD_LABELS[form.method]}</span>
                </CardTitle>
                {!done && (
                  <Button size="sm" variant={open ? 'ghost' : 'default'} onClick={() => setOpenKey(open ? null : form.formKey)}>
                    {open ? '닫기' : '작성·제출'}
                  </Button>
                )}
              </div>
              {done && (
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(form.submittedAt!)} · {METHOD_LABELS[form.submittedMethod ?? form.method]}{form.fileName ? ` · ${form.fileName}` : ''} — 재제출이 필요하면 운영사에 문의하세요.
                </p>
              )}
            </CardHeader>
            {!done && open && (
              <CardContent>{form.method === 'web' ? <WebForm form={form} /> : <FileForm form={form} />}</CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
