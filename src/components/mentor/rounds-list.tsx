'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Trash2, FileText, PenLine } from 'lucide-react';

import type { RoundItem } from '@/lib/data/rounds';
import { deleteRoundAction, collectRoundSignatureAction, updatePlannedRoundAction, deletePlannedRoundAction } from '@/lib/workflow/mentor-actions';
import { RoundReportForm } from '@/components/mentor/round-report-form';
import { SignaturePad } from '@/components/common/signature-pad';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

function toLocalParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** 계획(미보고) 회차 일정 수정 (P20) — 일자·시각(10분 단위)·유형·장소 */
function PlannedRoundEditor({ caseId, round, onClose }: { caseId: string; round: RoundItem; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const s = toLocalParts(round.started_at);
  const e = toLocalParts(round.ended_at);
  const [date, setDate] = useState(s.date);
  const [startTime, setStartTime] = useState(s.time);
  const [endTime, setEndTime] = useState(e.time);
  const [mode, setMode] = useState<'online' | 'offline'>(round.mode === 'offline' ? 'offline' : 'online');
  const [place, setPlace] = useState(round.place ?? '');

  const submit = () => {
    if (!date || !startTime || !endTime) {
      toast({ title: '일자와 시각을 입력하세요.', variant: 'destructive' });
      return;
    }
    start(async () => {
      const r = await updatePlannedRoundAction({
        caseId,
        logId: round.id,
        mode,
        startedAt: new Date(`${date}T${startTime}:00+09:00`).toISOString(),
        endedAt: new Date(`${date}T${endTime}:00+09:00`).toISOString(),
        place,
      });
      toast(r.ok ? { title: '일정을 수정했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) {
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-sky-300 bg-sky-50/50 p-3 text-sm dark:border-sky-800 dark:bg-sky-950/20">
      <p className="font-semibold">{round.round_no}회차 일정 수정</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          일자
          <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} className="h-9 rounded-md border bg-background px-2" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          시작
          <input type="time" step={600} value={startTime} onChange={(ev) => setStartTime(ev.target.value)} className="h-9 rounded-md border bg-background px-2" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          종료
          <input type="time" step={600} value={endTime} onChange={(ev) => setEndTime(ev.target.value)} className="h-9 rounded-md border bg-background px-2" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          방법
          <select value={mode} onChange={(ev) => setMode(ev.target.value as 'online' | 'offline')} className="h-9 rounded-md border bg-background px-2">
            <option value="online">온라인</option>
            <option value="offline">오프라인</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs">
          장소
          <input value={place} onChange={(ev) => setPlace(ev.target.value)} placeholder="장소" className="h-9 min-w-[140px] rounded-md border bg-background px-2" />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">일자·방법을 바꾸면 그 날짜 기준 단가로 다시 확정되고, 일일 상한·시간 겹침 검증을 다시 통과해야 합니다.</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose} disabled={pending}>취소</Button>
        <Button size="sm" onClick={submit} disabled={pending}>{pending ? '저장 중…' : '일정 저장'}</Button>
      </div>
    </div>
  );
}

/** 현장 서명 수집 (P20) — 멘토 스마트폰 화면을 멘티에게 건네 터치 서명을 받는다 */
function CollectSignature({ caseId, logId, roundNo }: { caseId: string; logId: string; roundNo: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  if (!open) {
    return (
      <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpen(true)}>
        <PenLine className="h-4 w-4" /> 현장 서명 받기
      </Button>
    );
  }
  return (
    <div className="mt-2 flex w-full flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-semibold">{roundNo}회차 — 멘티 확인 서명 (현장 수집)</p>
      <p className="text-xs text-muted-foreground">휴대폰 화면을 멘티에게 건네 화면 터치로 직접 서명을 받으세요. 저장하면 멘티 서명으로 등록됩니다.</p>
      <SignaturePad label="멘티 서명" onChange={setDataUrl} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setOpen(false)}>취소</Button>
        <Button
          size="sm"
          disabled={pending || !dataUrl}
          onClick={() =>
            start(async () => {
              const r = await collectRoundSignatureAction(caseId, logId, dataUrl!);
              toast(r.ok ? { title: '멘티 서명을 등록했습니다.' } : { title: r.error, variant: 'destructive' });
              if (r.ok) {
                setOpen(false);
                router.refresh();
              }
            })
          }
        >
          {pending ? '등록 중…' : '서명 등록'}
        </Button>
      </div>
    </div>
  );
}

function durationLabel(startedAt: string, endedAt: string): string {
  const minutes = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000);
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간${m > 0 ? ` ${m}분` : ''}` : `${m}분`;
}

/** 회차 목록 (멘토·스태프 공용). 멘토는 2단계 보고서 등록·마지막 회차 삭제 가능(정산 전) */
export function RoundsList({ caseId, rounds, editable, signEnabled = true }: { caseId: string; rounds: RoundItem[]; editable: boolean; /** 그룹 서명 정책이 꺼져 있으면 서명 배지·현장 서명 버튼을 숨긴다 (P28) */ signEnabled?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  if (rounds.length === 0) return <p className="text-sm text-muted-foreground">등록된 회차가 없습니다. {editable ? '위 [회차 등록]에서 1단계 계획/실행 정보를 먼저 등록하세요.' : '담당 멘토가 [회차 등록]으로 계획을 등록하면 여기에 표시됩니다.'}</p>;
  const last = rounds[rounds.length - 1]!;
  return (
    <ol className="flex flex-col gap-3">
      {rounds.map((r) => {
        const planned = !r.report_registered_at && new Date(r.started_at).getTime() > Date.now();
        const participants = (Array.isArray(r.participants) ? r.participants : []) as { name: string; role: string }[];
        return (
        <li key={r.id} className="rounded-lg border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{r.round_no}회차{r.is_extra ? ' (추가)' : ''}</span>
              <span className="font-medium">{r.mode === 'online' ? '온라인' : '오프라인'}</span>
              <span className="text-muted-foreground">{formatDateTime(r.started_at)} ~ {formatDateTime(r.ended_at).slice(-5)}</span>
              {durationLabel(r.started_at, r.ended_at) && <span className="text-xs font-medium text-primary">({durationLabel(r.started_at, r.ended_at)})</span>}
              {r.place && <span className="text-muted-foreground">· {r.place}</span>}
              <span className="text-xs text-muted-foreground">· {Number(r.amount_snapshot).toLocaleString('ko-KR')}원</span>
              {r.report_registered_at ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">보고서 등록됨</span>
              ) : planned ? (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-800">계획 (사전 등록)</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">보고서 대기 (2단계)</span>
              )}
              {signEnabled && r.report_registered_at && (r.mentee_signed_at ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800"><PenLine className="h-3 w-3" /> 멘티 서명</span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">서명 대기</span>
              ))}
              {r.locked && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /> 정산 포함</span>}
            </div>
            <div className="flex items-center gap-1">
              {/* 계획(미보고) 회차: 개별 일정 수정·삭제 (P20) */}
              {editable && !r.report_registered_at && !r.locked && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditingPlan((v) => (v === r.id ? null : r.id))}>
                  일정 수정
                </Button>
              )}
              {editable && !r.locked && (r.id === last.id || !r.report_registered_at) && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`${r.round_no}회차를 삭제할까요?${r.report_registered_at ? ' 사진·보고서 파일도 함께 삭제됩니다.' : ''}`)) return;
                    start(async () => {
                      const res = r.report_registered_at
                        ? await deleteRoundAction(caseId, r.id)
                        : await deletePlannedRoundAction(caseId, r.id);
                      toast(res.ok ? { title: '삭제했습니다.' } : { title: res.error, variant: 'destructive' });
                      if (res.ok) router.refresh();
                    });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          {participants.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              참가자: {participants.map((p) => `${p.name}${p.role === 'member' ? '(팀원)' : '(대표)'}`).join(' · ')}
            </p>
          )}
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
          {editable && editingPlan === r.id && !r.report_registered_at && !r.locked && (
            <PlannedRoundEditor caseId={caseId} round={r} onClose={() => setEditingPlan(null)} />
          )}
          {editable && !r.report_registered_at && !r.locked && !planned && (
            <div className="mt-2">
              <RoundReportForm caseId={caseId} logId={r.id} roundNo={r.round_no} />
            </div>
          )}
          {signEnabled && editable && r.report_registered_at && !r.mentee_signed_at && !r.locked && (
            <div className="mt-2">
              <CollectSignature caseId={caseId} logId={r.id} roundNo={r.round_no} />
            </div>
          )}
          {editable && !r.report_registered_at && planned && (
            <p className="mt-2 text-[11px] text-sky-700">진행 후 이 회차에서 [보고서 등록]이 열립니다.</p>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">멘토 {r.mentorName ?? '-'}</p>
        </li>
        );
      })}
    </ol>
  );
}
