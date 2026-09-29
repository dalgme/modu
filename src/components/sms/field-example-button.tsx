'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, Lightbulb } from 'lucide-react';

import {
  bulkSmsFieldExamples,
  loginGuideFieldExamples,
  mentorReminderFieldExamples,
  type SmsFieldExample,
} from '@/lib/sms/field-examples';
import type { BulkSmsFieldKey } from '@/lib/sms/bulk-sms-fields';
import type { LoginGuideFieldKey } from '@/lib/sms/login-guide-template';
import type { MentorReminderFieldKey } from '@/lib/sms/mentor-reminder-template';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** 어느 문자 화면의 필드인지 — 화면마다 실제 발송과 같은 렌더 함수로 예시를 만든다 */
export type SmsFieldExampleKind = 'bulk' | 'login' | 'reminder';

function examplesFor(kind: SmsFieldExampleKind, key: string): SmsFieldExample[] {
  if (kind === 'reminder') return mentorReminderFieldExamples(key as MentorReminderFieldKey);
  if (kind === 'login') return loginGuideFieldExamples(key as LoginGuideFieldKey);
  return bulkSmsFieldExamples(key as BulkSmsFieldKey);
}

/** 입력 예시에서 `{키}` 를 강조 — 지금 보고 있는 필드는 진하게, 섞어 쓴 다른 필드는 옅게 */
function HighlightedInput({ text, fieldKey }: { text: string; fieldKey: string }) {
  const parts = text.split(/(\{[^{}\n]{1,30}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{[^{}\n]{1,30}\}$/.test(p) ? (
          <mark
            key={i}
            className={cn(
              'rounded px-0.5 font-semibold',
              p === `{${fieldKey}}` ? 'bg-primary/20 text-primary' : 'bg-muted text-foreground/80',
            )}
          >
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/**
 * 자동 기입 필드 [예시] 버튼 — 누르면 "필드 사용 입력 예시 ↔ 발송되는 실제 문자 내용 예시" 대조 팝업.
 * props 는 문자열만(§6-10). 예시는 열 때 중립 모듈(`field-examples.ts`)에서 실제 렌더 함수로 계산한다.
 */
export function FieldExampleButton({
  kind,
  fieldKey,
  fieldLabel,
  className,
}: {
  kind: SmsFieldExampleKind;
  fieldKey: string;
  fieldLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const examples = useMemo(() => (open ? examplesFor(kind, fieldKey) : []), [open, kind, fieldKey]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${fieldLabel} {${fieldKey}} 사용 예시 보기`}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-primary/30 bg-background px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10',
          className,
        )}
      >
        <Lightbulb className="h-3 w-3" aria-hidden />
        예시
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base sm:text-lg">
              {fieldLabel} 사용 예시
              <code className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-sm text-primary">{`{${fieldKey}}`}</code>
            </DialogTitle>
            <DialogDescription className="text-left">
              왼쪽처럼 문자 내용에 쓰면, 오른쪽처럼 받는 사람 정보로 바뀌어 발송됩니다. 이름·번호는 설명을 위한 가짜 값입니다.
            </DialogDescription>
          </DialogHeader>

          <ol className="flex min-w-0 flex-col gap-3">
            {examples.map((ex, i) => (
              <li key={i} className="min-w-0 rounded-lg border bg-muted/20 p-3">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
                  {ex.title}
                  <span className="text-xs font-normal text-muted-foreground">· {ex.who}</span>
                </p>
                <div className="mt-2 grid min-w-0 items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[11px] font-semibold text-muted-foreground">필드사용 입력 예시</span>
                    <div className="flex-1 whitespace-pre-wrap break-all rounded-md border border-dashed bg-background px-3 py-2 font-mono text-xs leading-relaxed">
                      <HighlightedInput text={ex.input} fieldKey={fieldKey} />
                    </div>
                  </div>
                  <div className="flex items-center justify-center text-muted-foreground" aria-hidden>
                    <ArrowDown className="h-4 w-4 sm:hidden" />
                    <ArrowRight className="hidden h-4 w-4 sm:block" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[11px] font-semibold text-muted-foreground">발송되는 실제 문자 내용 예시</span>
                    <div className="flex-1 whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-sky-100 px-3 py-2 text-xs leading-relaxed text-sky-950 [overflow-wrap:anywhere] dark:bg-sky-950/50 dark:text-sky-50">
                      {ex.output}
                    </div>
                  </div>
                </div>
                {ex.note && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">※ {ex.note}</p>}
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
