'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, PenLine } from 'lucide-react';

import type { RoundItem } from '@/lib/data/rounds';
import { signRoundAction } from '@/lib/workflow/mentee-actions';
import { SignaturePad } from '@/components/common/signature-pad';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

/** 멘티 회차 확인·서명 목록 — 회차 내용을 확인하고 캔버스 서명으로 확인한다(회차당 1회). */
export function RoundSignList({ caseId, rounds }: { caseId: string; rounds: RoundItem[] }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  if (rounds.length === 0) return <p className="text-sm text-muted-foreground">아직 등록된 컨설팅 회차가 없습니다.</p>;

  const submit = (logId: string) => {
    if (!sig) {
      toast({ title: '서명을 입력하세요.', variant: 'destructive' });
      return;
    }
    start(async () => {
      const r = await signRoundAction(caseId, logId, sig);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: '서명이 저장되었습니다.' });
      setOpenId(null);
      setSig(null);
    });
  };

  return (
    <ol className="flex flex-col gap-3">
      {rounds.map((r) => (
        <li key={r.id} className="rounded-xl border bg-background p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{r.round_no}회차{r.is_extra ? ' (추가)' : ''}</span>
              <span>{r.mode === 'online' ? '온라인' : '오프라인'}</span>
              <span className="text-muted-foreground">{formatDateTime(r.started_at)} ~ {formatDateTime(r.ended_at).slice(-5)}</span>
              {r.place && <span className="text-muted-foreground">· {r.place}</span>}
              <span className="text-muted-foreground">· 멘토 {r.mentorName ?? '-'}</span>
            </div>
            {r.mentee_signed_at ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" /> 서명 완료 {formatDateTime(r.mentee_signed_at)}
              </span>
            ) : (
              <Button size="sm" variant={openId === r.id ? 'ghost' : 'default'} className="gap-1" disabled={pending} onClick={() => { setOpenId(openId === r.id ? null : r.id); setSig(null); }}>
                <PenLine className="h-4 w-4" /> {openId === r.id ? '닫기' : '확인 · 서명'}
              </Button>
            )}
          </div>
          {r.topic && <p className="mt-2 text-sm font-semibold">{r.topic}</p>}
          {r.content && <p className="mt-1 whitespace-pre-wrap text-sm">{r.content}</p>}
          {r.result && <p className="mt-1 text-sm text-muted-foreground">결과·다음 과제: {r.result}</p>}
          {r.report && (
            <p className="mt-1 text-sm">
              보고서:{' '}
              {r.report.url ? (
                <a href={r.report.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {r.report.name}
                </a>
              ) : (
                r.report.name
              )}
            </p>
          )}
          {r.photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {/* signed URL(5분) 이미지 — next/image 최적화 대상이 아님 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.photos.map((p) => p.url && <img key={p.id} src={p.url} alt={p.name} className="h-20 w-20 rounded-md object-cover" />)}
            </div>
          )}
          {openId === r.id && !r.mentee_signed_at && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg border border-dashed p-3">
              <p className="text-xs text-muted-foreground">위 내용대로 컨설팅을 받았음을 확인하고 서명합니다. 서명 후에는 멘토가 내용을 수정할 수 없습니다.</p>
              <SignaturePad label="멘티 서명" onChange={setSig} />
              <div className="flex justify-end">
                <Button size="sm" disabled={pending || !sig} onClick={() => submit(r.id)}>
                  {pending ? '저장 중…' : '서명 제출'}
                </Button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
