'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Trash2, FileText, PenLine } from 'lucide-react';

import type { RoundItem } from '@/lib/data/rounds';
import { deleteRoundAction } from '@/lib/workflow/mentor-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

/** 회차 목록 (멘토·스태프 공용). 멘토는 마지막 회차 삭제 가능(정산 전) */
export function RoundsList({ caseId, rounds, editable }: { caseId: string; rounds: RoundItem[]; editable: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  if (rounds.length === 0) return <p className="text-sm text-muted-foreground">등록된 회차가 없습니다.</p>;
  const last = rounds[rounds.length - 1]!;
  return (
    <ol className="flex flex-col gap-3">
      {rounds.map((r) => (
        <li key={r.id} className="rounded-lg border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{r.round_no}회차{r.is_extra ? ' (추가)' : ''}</span>
              <span className="font-medium">{r.mode === 'online' ? '온라인' : '오프라인'}</span>
              <span className="text-muted-foreground">{formatDateTime(r.started_at)} ~ {formatDateTime(r.ended_at).slice(-5)}</span>
              {r.place && <span className="text-muted-foreground">· {r.place}</span>}
              <span className="text-xs text-muted-foreground">· {Number(r.amount_snapshot).toLocaleString('ko-KR')}원</span>
              {r.mentee_signed_at ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800"><PenLine className="h-3 w-3" /> 멘티 서명</span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">서명 대기</span>
              )}
              {r.locked && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /> 정산 포함</span>}
            </div>
            {editable && r.id === last.id && !r.locked && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`${r.round_no}회차를 삭제할까요? 사진·보고서 파일도 함께 삭제됩니다.`)) return;
                  start(async () => {
                    const res = await deleteRoundAction(caseId, r.id);
                    toast(res.ok ? { title: '삭제했습니다.' } : { title: res.error, variant: 'destructive' });
                    if (res.ok) router.refresh();
                  });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          {r.topic && <p className="mt-2 text-sm font-medium">{r.topic}</p>}
          {r.content && <p className="mt-1 whitespace-pre-wrap text-sm">{r.content}</p>}
          {r.result && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">결과: {r.result}</p>}
          {r.report && (
            <p className="mt-2 text-sm">
              <a href={r.report.url ?? '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <FileText className="h-4 w-4" /> {r.report.name}
              </a>
            </p>
          )}
          {r.photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {r.photos.map((p) =>
                p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.name} className="h-20 w-20 rounded-md object-cover" /></a>
                ) : null,
              )}
            </div>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">멘토 {r.mentorName ?? '-'}</p>
        </li>
      ))}
    </ol>
  );
}
