'use client';

import { useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileUp } from 'lucide-react';

import { uploadPaymentDocAction, type PaymentDocKind } from '@/lib/mentors/payment-doc-actions';
import { stageUpload } from '@/lib/storage/browser-upload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';

export interface PaymentDocSlot {
  kind: PaymentDocKind;
  label: string;
  fileName: string | null;
  uploadedAt: string | null;
  /** 운영사 수령 확인 일시 */
  receivedAt: string | null;
}

/** 멘토 지급서류 제출 패널 — 이력서·통장사본·신분증사본 업로드 (P20) */
export function PaymentDocsPanel({ slots }: { slots: PaymentDocSlot[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  const upload = (kind: PaymentDocKind) => {
    const input = refs.current[kind];
    const f = input?.files?.[0];
    if (!f) {
      toast({ title: '파일을 먼저 선택하세요.', variant: 'destructive' });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: '파일이 너무 큽니다. (최대 10MB)', variant: 'destructive' });
      return;
    }
    start(async () => {
      try {
        const staged = await stageUpload(f, 'documents');
        const r = await uploadPaymentDocAction(kind, { stagingPath: staged.stagingPath, fileName: staged.fileName });
        if (!r.ok) {
          toast({ title: r.error, variant: 'destructive' });
          return;
        }
        toast({ title: '제출했습니다.' });
        if (input) input.value = '';
        router.refresh();
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : '업로드 실패', variant: 'destructive' });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">지급서류 제출</CardTitle>
        <CardDescription>
          정산(지급)에 필요한 <b>이력서 · 통장사본 · 신분증사본</b>을 올려 주세요. 다시 올리면 이전 파일을 대체합니다.
          제출 후 운영사가 수령 확인하면 완료입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {slots.map((s) => (
          <div key={s.kind} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3">
            <div className="min-w-[100px] font-semibold">{s.label}</div>
            <div className="flex-1 text-sm">
              {s.fileName ? (
                <span className="text-emerald-700">
                  제출됨 — {s.fileName} ({s.uploadedAt ? formatDate(s.uploadedAt) : ''})
                </span>
              ) : (
                <span className="text-muted-foreground">미제출</span>
              )}
              {s.receivedAt && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 운영사 수령 확인 {formatDate(s.receivedAt)}
                </span>
              )}
            </div>
            <input
              ref={(el) => {
                refs.current[s.kind] = el;
              }}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.hwp,.hwpx,.doc,.docx"
              className="max-w-[220px] text-xs"
              disabled={pending}
            />
            <Button size="sm" onClick={() => upload(s.kind)} disabled={pending} className="gap-1">
              <FileUp className="h-4 w-4" /> {s.fileName ? '다시 제출' : '제출'}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
