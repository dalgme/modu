'use client';

import { useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { saveMentorFormSettingAction, type MentorFormActionState } from '@/lib/mentor-forms/actions';
import { DEFAULT_FORMS, FORM_LABELS, METHOD_LABELS, type MentorFormKey, type MentorFormMethod } from '@/lib/mentor-forms/defs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface MentorFormSettingItem {
  formKey: MentorFormKey;
  enabled: boolean;
  method: MentorFormMethod;
  title: string;
  content: string;
  isDefault: boolean;
  /** 제출 건수 (설정 화면 참고용) */
  submittedCount: number;
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? '저장 중…' : '저장'}
    </Button>
  );
}

function FormCard({ item }: { item: MentorFormSettingItem }) {
  const [state, action] = useFormState<MentorFormActionState, FormData>(saveMentorFormSettingAction, undefined);
  const [enabled, setEnabled] = useState(item.enabled);
  const [method, setMethod] = useState<MentorFormMethod>(item.method);
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  return (
    <Card className={enabled ? 'border-primary/40' : ''}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {FORM_LABELS[item.formKey]}
            {enabled ? <Badge>사용</Badge> : <Badge variant="outline">미사용</Badge>}
            {item.enabled && <span className="text-xs font-normal text-muted-foreground">제출 {item.submittedCount}건</span>}
          </CardTitle>
          <button type="button" className="text-xs text-primary underline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? '접기' : '내용 편집'}
          </button>
        </div>
        {item.isDefault && <CardDescription className="text-xs">표준 양식 기본값 상태입니다. 제목·본문은 이 행사에 맞게 편집할 수 있습니다.</CardDescription>}
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="formKey" value={item.formKey} />
          <input type="hidden" name="enabled" value={enabled ? 'true' : 'false'} />
          <input type="hidden" name="method" value={method} />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              이 행사에서 이 서식을 사용
            </label>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-xs text-muted-foreground">수령 방식:</span>
              {(Object.keys(METHOD_LABELS) as MentorFormMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-full border px-3 py-1 text-xs ${method === m ? 'border-primary bg-primary/10 font-semibold text-primary' : 'text-muted-foreground'}`}
                >
                  {METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* 접혀 있어도 폼 값은 유지되도록 display 토글 (unmount 하면 편집 내용이 유실된다) */}
          <div className={expanded ? 'flex flex-col gap-2 rounded-md border bg-muted/30 p-3' : 'hidden'}>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">제목</Label>
                <Input ref={titleRef} name="title" defaultValue={item.title} className="h-8 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">
                  본문 <span className="font-normal text-muted-foreground">— {'{program}'} {'{client}'} {'{operator}'} 플레이스홀더는 행사명·기관명으로 자동 치환됩니다</span>
                </Label>
                <textarea ref={contentRef} name="content" defaultValue={item.content} rows={12} className="rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs leading-relaxed" />
              </div>
              <div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => {
                    if (!confirm('제목·본문을 표준 양식 기본값으로 되돌릴까요? (저장을 눌러야 반영됩니다)')) return;
                    if (titleRef.current) titleRef.current.value = DEFAULT_FORMS[item.formKey].title;
                    if (contentRef.current) contentRef.current.value = DEFAULT_FORMS[item.formKey].content;
                  }}
                >
                  표준 양식 기본값 복원
                </button>
              </div>
            </div>

          <div className="flex items-center gap-2">
            <Save />
            {state?.ok === false && <span className="text-xs text-destructive">{state.error}</span>}
            {state?.ok && <span className="text-xs text-status-approved">{state.message}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * 위촉 서식 설정 (행사별) — 책임멘토 위촉 동의서·개인정보 동의서·서약서·사전 확인서.
 * 사용 여부·수령 방식(웹 작성/파일 첨부)·표준 양식 내용 편집. 집계현황은 멘토 명단 상단에 표시된다.
 */
export function MentorFormsManager({ items }: { items: MentorFormSettingItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        사용으로 체크한 서식은 멘토 화면([위촉 서류])에 나타나고, 제출 집계현황이 <b>멘토 명단</b> 상단에 표시됩니다. 웹 작성 서식의 동의 문항·인적사항 항목 구조는 표준으로 고정되며, 제목과 본문 문구를 행사에 맞게 편집할 수 있습니다.
      </p>
      {items.map((item) => (
        <FormCard key={item.formKey} item={item} />
      ))}
    </div>
  );
}
