'use client';

import { useRef, useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { FileUp } from 'lucide-react';

import {
  saveMentorFormSettingAction,
  saveMentorFormTemplateAction,
  clearMentorFormOverrideAction,
  type MentorFormActionState,
} from '@/lib/mentor-forms/actions';
import { DEFAULT_FORMS, FORM_LABELS, METHOD_LABELS, type MentorFormKey, type MentorFormMethod } from '@/lib/mentor-forms/defs';
import { stageUpload } from '@/lib/storage/browser-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export interface MentorFormSettingItem {
  formKey: MentorFormKey;
  enabled: boolean;
  method: MentorFormMethod;
  title: string;
  content: string;
  /** 이 스코프에 직접 저장된 행이 있는지 (그룹에서 false = 행사 공통을 따르는 중) */
  defined: boolean;
  templateName: string | null;
  templateUrl: string | null;
  /** 제출 건수 (참고용, 행사 전체) */
  submittedCount: number;
}

export interface MentorFormScope {
  /** null = 행사 공통 */
  id: string | null;
  name: string;
  items: MentorFormSettingItem[];
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? '저장 중…' : '저장'}
    </Button>
  );
}

/** 표준양식 파일 업로드 (파일 첨부 방식) — 멘토가 다운로드해 쓸 원본 서식 */
function TemplateUpload({ formKey, supportTypeId, templateName, templateUrl }: {
  formKey: MentorFormKey;
  supportTypeId: string | null;
  templateName: string | null;
  templateUrl: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return toast({ title: '표준양식 파일을 선택하세요.', variant: 'destructive' });
    start(async () => {
      try {
        const staged = await stageUpload(f, 'documents');
        const r = await saveMentorFormTemplateAction({ formKey, supportTypeId, stagingPath: staged.stagingPath, fileName: f.name });
        if (!r?.ok) {
          toast({ title: r?.ok === false ? r.error : '등록 실패', variant: 'destructive' });
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
    <div className="flex flex-col gap-1.5 rounded-md border border-dashed bg-background p-2.5">
      <p className="text-xs font-medium">
        표준양식 파일 <span className="font-normal text-muted-foreground">— 멘토가 이 파일을 다운로드해 작성한 뒤 업로드합니다</span>
      </p>
      {templateName ? (
        <p className="text-xs">
          현재: {templateUrl ? <a href={templateUrl} target="_blank" rel="noreferrer" className="text-primary underline">{templateName}</a> : templateName}
          <span className="ml-1 text-muted-foreground">(새 파일을 올리면 교체됩니다)</span>
        </p>
      ) : (
        <p className="text-xs text-amber-700">아직 표준양식 파일이 없습니다 — 파일이 없으면 멘토는 본문 안내만 보고 제출합니다.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input ref={fileRef} type="file" accept=".pdf,.hwp,.hwpx,.doc,.docx,.xlsx" className="h-8 max-w-xs text-xs" />
        <Button size="sm" variant="outline" onClick={upload} disabled={pending} className="gap-1">
          <FileUp className="h-3.5 w-3.5" /> {pending ? '업로드 중…' : templateName ? '양식 교체' : '양식 업로드'}
        </Button>
      </div>
    </div>
  );
}

function ClearOverrideButton({ formKey, supportTypeId }: { formKey: MentorFormKey; supportTypeId: string }) {
  const [state, action] = useFormState<MentorFormActionState, FormData>(clearMentorFormOverrideAction, undefined);
  return (
    <form action={action} onSubmit={(e) => { if (!confirm('이 그룹의 별도 설정을 해제하고 행사 공통 설정을 따르게 할까요? 그룹 전용 표준양식 파일도 삭제됩니다.')) e.preventDefault(); }} className="inline-flex items-center gap-1">
      <input type="hidden" name="formKey" value={formKey} />
      <input type="hidden" name="supportTypeId" value={supportTypeId} />
      <button type="submit" className="text-xs text-muted-foreground underline hover:text-destructive">그룹 설정 해제 (공통 따르기)</button>
      {state?.ok === false && <span className="text-[10px] text-destructive">{state.error}</span>}
    </form>
  );
}

function FormCard({ item, supportTypeId, scopeName }: { item: MentorFormSettingItem; supportTypeId: string | null; scopeName: string }) {
  const [state, action] = useFormState<MentorFormActionState, FormData>(saveMentorFormSettingAction, undefined);
  const [enabled, setEnabled] = useState(item.enabled);
  const [method, setMethod] = useState<MentorFormMethod>(item.method);
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const isGroup = supportTypeId !== null;
  const inheriting = isGroup && !item.defined;

  return (
    <Card className={enabled ? 'border-primary/40' : ''}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {FORM_LABELS[item.formKey]}
            {enabled ? <Badge>사용</Badge> : <Badge variant="outline">미사용</Badge>}
            {inheriting && <Badge variant="secondary" className="font-normal">행사 공통 따름</Badge>}
            {!inheriting && isGroup && item.defined && <Badge variant="secondary" className="font-normal">{scopeName} 전용</Badge>}
            {item.enabled && <span className="text-xs font-normal text-muted-foreground">제출 {item.submittedCount}건</span>}
          </CardTitle>
          <button type="button" className="text-xs text-primary underline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? '접기' : '내용 편집'}
          </button>
        </div>
        {inheriting && (
          <CardDescription className="text-xs">
            현재 이 그룹은 행사 공통 설정을 따릅니다. 아래를 수정해 저장하면 <b>{scopeName} 전용 설정</b>이 만들어집니다.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="formKey" value={item.formKey} />
          <input type="hidden" name="supportTypeId" value={supportTypeId ?? ''} />
          <input type="hidden" name="enabled" value={enabled ? 'true' : 'false'} />
          <input type="hidden" name="method" value={method} />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              {isGroup ? '이 그룹에서 이 서식을 사용' : '이 행사에서 이 서식을 사용'}
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
                  {m === 'web' ? '웹 작성' : '업로드 (파일 첨부)'}
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

          <div className="flex flex-wrap items-center gap-2">
            <Save />
            {isGroup && item.defined && <ClearOverrideButton formKey={item.formKey} supportTypeId={supportTypeId} />}
            {state?.ok === false && <span className="text-xs text-destructive">{state.error}</span>}
            {state?.ok && <span className="text-xs text-status-approved">{state.message}</span>}
          </div>
        </form>

        {method === 'file' && (
          <TemplateUpload formKey={item.formKey} supportTypeId={supportTypeId} templateName={item.templateName} templateUrl={item.templateUrl} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 위촉 서식 설정 — 행사 공통 + 사업그룹별 override.
 * 그룹 탭에서 저장하면 그 그룹 전용 설정이 되고, 해제하면 행사 공통을 따른다.
 * 수령 방식이 업로드(파일 첨부)면 표준양식 파일을 등록해 멘토가 다운로드하게 한다.
 */
export function MentorFormsManager({ scopes }: { scopes: MentorFormScope[] }) {
  const [scopeIdx, setScopeIdx] = useState(0);
  const scope = scopes[scopeIdx] ?? scopes[0]!;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        서식 사용 여부·수령 방식(웹 작성/업로드)·내용을 <b>행사 공통</b> 또는 <b>사업그룹별</b>로 설정합니다. 그룹에 별도 설정이 있으면 그 그룹 멘토에게는 그룹 설정이 우선 적용됩니다. 제출 집계현황은 <b>멘토 명단</b> 상단에 표시됩니다.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {scopes.map((s, i) => (
          <button
            key={s.id ?? 'common'}
            type="button"
            onClick={() => setScopeIdx(i)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              i === scopeIdx ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent',
            )}
          >
            {s.name}
          </button>
        ))}
      </div>
      {scope.items.map((item) => (
        <FormCard key={`${scope.id ?? 'common'}-${item.formKey}`} item={item} supportTypeId={scope.id} scopeName={scope.name} />
      ))}
    </div>
  );
}
