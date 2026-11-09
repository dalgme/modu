'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { saveDelayNudgeTemplateAction } from '@/lib/sms/delay-nudge-template-actions';
import { DEFAULT_DELAY_NUDGE_TEMPLATE, DELAY_NUDGE_FIELDS, DELAY_NUDGE_MAX_LENGTH, sampleDelayNudge, validateDelayNudgeTemplate } from '@/lib/sms/delay-nudge-template';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

export interface DelayNudgeEditorProps {
  template: string;
  customized: boolean;
  canEdit: boolean;
  programName: string;
  appUrl: string;
}

/**
 * 지연 독려 문자 문구 편집 (2026-11-09) — 문자 발송 › 자동발송 탭의 '지연 독려 문자' 항목.
 * 필드 버튼(커서 위치에 넣기) · 실시간 미리보기(발송과 같은 함수) · 저장 · 기본 문구로 되돌리기.
 */
export function DelayNudgeTemplateEditor({ template, customized, canEdit, programName, appUrl, onClose }: DelayNudgeEditorProps & { onClose: () => void }) {
  const [text, setText] = useState(template);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const router = useRouter();
  const error = validateDelayNudgeTemplate(text);
  const dirty = text.trim() !== template.trim();

  const insert = (key: string) => {
    const el = ref.current;
    if (!el) return setText((t) => t + key);
    const s = el.selectionStart ?? text.length;
    const e = el.selectionEnd ?? text.length;
    const next = text.slice(0, s) + key + text.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + key.length, s + key.length);
    });
  };

  const save = (value: string | null) =>
    start(async () => {
      const r = await saveDelayNudgeTemplateAction(value);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: r.message });
      if (value === null) setText(DEFAULT_DELAY_NUDGE_TEMPLATE);
      router.refresh();
      onClose();
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">지연 독려 문자 문구 수정 {customized ? <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">이 행사 문구 사용 중</span> : <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">기본 문구</span>}</span>
        {!canEdit && <span className="text-[11px] text-muted-foreground">문자 발송 권한이 있는 운영사 담당자만 수정할 수 있습니다.</span>}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-muted-foreground">자동 기입 필드 — 누르면 커서 위치에 들어갑니다</span>
        <div className="flex flex-wrap gap-1">
          {DELAY_NUDGE_FIELDS.map((f) => (
            <button key={f.key} type="button" disabled={!canEdit || pending} onClick={() => insert(f.key)} className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-accent disabled:opacity-50" title={`예: ${f.example}`}>
              {f.label} : <b className="font-mono">{f.key}</b>
            </button>
          ))}
        </div>
      </div>
      <Textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} disabled={!canEdit || pending} rows={6} maxLength={DELAY_NUDGE_MAX_LENGTH} className="font-sans text-sm" />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{error ? <span className="text-destructive">{error}</span> : '멘티 목록은 한 줄에 한 명씩, 최대 5명까지 나오고 나머지는 "외 N건"으로 붙습니다.'}</span>
        <span className="tabular-nums">{text.length}/{DELAY_NUDGE_MAX_LENGTH}</span>
      </div>
      <div className="rounded-md bg-muted/40 p-3">
        <div className="mb-1 text-[11px] font-semibold text-muted-foreground">미리보기 (예시 값 · 실제 발송과 같은 방식)</div>
        <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">{error ? '—' : sampleDelayNudge(text, programName, appUrl)}</pre>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={pending} onClick={onClose}>닫기</Button>
        {canEdit && customized && (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => save(null)}>기본 문구로 되돌리기</Button>
        )}
        {canEdit && (
          <Button size="sm" disabled={pending || !!error || !dirty} onClick={() => save(text)}>
            {pending ? '저장 중…' : '문구 저장'}
          </Button>
        )}
      </div>
    </div>
  );
}
