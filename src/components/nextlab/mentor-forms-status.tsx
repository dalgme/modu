'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { FileText } from 'lucide-react';

import { rejectMentorFormSubmissionAction, type MentorFormActionState } from '@/lib/mentor-forms/actions';
import {
  APPOINTMENT_FIELDS,
  FORM_LABELS,
  METHOD_LABELS,
  PRECHECK_QUESTIONS,
  PRIVACY_QUESTIONS,
  type MentorFormAnswers,
  type MentorFormKey,
  type MentorFormMethod,
} from '@/lib/mentor-forms/defs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/utils/format';

export interface FormStatusItem {
  formKey: MentorFormKey;
  method: MentorFormMethod;
  title: string;
  submitted: {
    id: string;
    mentorName: string;
    method: MentorFormMethod;
    submittedAt: string;
    signedName: string | null;
    answers: MentorFormAnswers;
    contentSnapshot: string | null;
    fileName: string | null;
    fileUrl: string | null;
    rrn: string | null;
  }[];
  missing: { userId: string; name: string }[];
}

function RejectButton({ submissionId, mentorName }: { submissionId: string; mentorName: string }) {
  const [state, action] = useFormState<MentorFormActionState, FormData>(rejectMentorFormSubmissionAction, undefined);
  const { pending } = useFormStatus();
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(`${mentorName} 님의 제출물을 반려(삭제)할까요? 멘토가 다시 제출할 수 있게 됩니다.`)) e.preventDefault(); }} className="inline-flex items-center gap-1">
      <input type="hidden" name="submissionId" value={submissionId} />
      <button type="submit" disabled={pending} className="text-xs text-muted-foreground underline hover:text-destructive">반려</button>
      {state?.ok === false && <span className="text-[10px] text-destructive">{state.error}</span>}
    </form>
  );
}

/** 웹 제출 응답 상세 (다이얼로그) */
function SubmissionDetail({ formKey, row }: { formKey: MentorFormKey; row: FormStatusItem['submitted'][number] }) {
  const a = row.answers;
  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto text-sm">
      <p className="text-xs text-muted-foreground">제출 {formatDateTime(row.submittedAt)} · 서명 {row.signedName ?? '-'}</p>
      {formKey === 'appointment' && (
        <table className="text-sm">
          <tbody>
            {APPOINTMENT_FIELDS.map((f) => (
              <tr key={f.key} className="border-b last:border-0">
                <th className="w-28 py-1.5 pr-3 text-left text-xs text-muted-foreground">{f.label}</th>
                <td className="py-1.5">{a.fields?.[f.key] ?? '-'}</td>
              </tr>
            ))}
            <tr>
              <th className="w-28 py-1.5 pr-3 text-left text-xs text-muted-foreground">주민등록번호</th>
              <td className="py-1.5 font-mono">{row.rrn ?? '-'}</td>
            </tr>
          </tbody>
        </table>
      )}
      {formKey === 'privacy' && (
        <ul className="flex flex-col gap-1.5">
          {PRIVACY_QUESTIONS.map((q) => (
            <li key={q.key} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5">
              <span className="text-xs">{q.label}</span>
              {a.consents?.[q.key] === 'yes' ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">동의함</Badge> : <Badge variant="destructive">동의하지 않음</Badge>}
            </li>
          ))}
        </ul>
      )}
      {formKey === 'pledge' && <p>{a.agreed ? '서약 확인에 동의했습니다.' : '-'}</p>}
      {formKey === 'precheck' && (
        <ul className="flex flex-col gap-1.5">
          {PRECHECK_QUESTIONS.map((q) => {
            const c = a.checks?.[q.key];
            return (
              <li key={q.key} className="rounded border px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs">{q.label}</span>
                  {c?.answer === 'exists' ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">해당 있음</Badge> : <Badge variant="secondary">해당 없음</Badge>}
                </div>
                {c?.detail && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{c.detail}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {row.contentSnapshot && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">동의 당시 본문 보기</summary>
          <div className="mt-1 whitespace-pre-wrap rounded border bg-muted/30 p-2 text-xs leading-relaxed">{row.contentSnapshot}</div>
        </details>
      )}
    </div>
  );
}

/**
 * 위촉 서식 집계현황 (멘토 명단 상단) — 사용 중 서식별 제출/미제출.
 * 주민등록번호는 민감정보 권한(members.sensitive)이 있을 때만 원문이 서버에서 내려온다.
 */
export function MentorFormsStatus({ items }: { items: FormStatusItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const totalTargets = items[0] ? items[0].submitted.length + items[0].missing.length : 0;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> 위촉 서식 제출 현황
            <span className="text-xs font-normal text-muted-foreground">대상 멘토 {totalTargets}명</span>
          </CardTitle>
          <button type="button" className="text-xs text-primary underline" onClick={() => setOpen((v) => !v)}>
            {open ? '접기' : '자세히'}
          </button>
        </div>
        <CardDescription className="flex flex-wrap gap-2">
          {items.map((it) => {
            const done = it.submitted.length;
            const total = done + it.missing.length;
            const complete = total > 0 && done === total;
            return (
              <span key={it.formKey} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${complete ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
                {FORM_LABELS[it.formKey]} <b className="tabular-nums">{done}/{total}</b>
              </span>
            );
          })}
        </CardDescription>
      </CardHeader>
      {open && (
        <CardContent className="flex flex-col gap-4">
          {items.map((it) => (
            <div key={it.formKey} className="flex flex-col gap-2">
              <p className="text-sm font-semibold">
                {FORM_LABELS[it.formKey]} <span className="font-normal text-muted-foreground">· {METHOD_LABELS[it.method]}</span>
              </p>
              {it.submitted.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {it.submitted.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs">
                      <b>{s.mentorName}</b>
                      <span className="text-muted-foreground">{formatDateTime(s.submittedAt).slice(0, -6)}</span>
                      {s.method === 'file' ? (
                        s.fileUrl ? (
                          <a href={s.fileUrl} target="_blank" rel="noreferrer" className="text-primary underline">{s.fileName ?? '파일'}</a>
                        ) : (
                          <span>{s.fileName ?? '파일'}</span>
                        )
                      ) : (
                        <Dialog>
                          <DialogTrigger asChild>
                            <button type="button" className="text-primary underline">응답 보기</button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>{FORM_LABELS[it.formKey]} — {s.mentorName}</DialogTitle>
                            </DialogHeader>
                            <SubmissionDetail formKey={it.formKey} row={s} />
                          </DialogContent>
                        </Dialog>
                      )}
                      <RejectButton submissionId={s.id} mentorName={s.mentorName} />
                    </span>
                  ))}
                </div>
              )}
              {it.missing.length > 0 ? (
                <p className="text-xs text-amber-800">
                  미제출 {it.missing.length}명: {it.missing.map((m) => m.name).join(', ')}
                </p>
              ) : (
                <p className="text-xs text-emerald-700">전원 제출 완료</p>
              )}
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            서식 사용 여부·수령 방식·내용 편집은 <a href="/nextlab/settings?tab=mentor-forms" className="text-primary underline">운영 설정 → 위촉 서식</a>에서 합니다. 반려하면 멘토가 다시 제출할 수 있습니다.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
