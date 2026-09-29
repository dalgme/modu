'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, FileText, Lock, PenLine, Trash2 } from 'lucide-react';

import type { RoundItem } from '@/lib/data/rounds';
import { deleteRoundAction, deletePlannedRoundAction } from '@/lib/workflow/mentor-actions';
import { roundModeLabel, roundReportFileName } from '@/lib/workflow/round-report-name';
import { RoundForm, type LastRoundDefaults, type ParticipantOption } from '@/components/mentor/round-form';
import { RoundReportForm } from '@/components/mentor/round-report-form';
import { CollectSignature, PlannedRoundEditor } from '@/components/mentor/rounds-list';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { kstHm, kstMd, toKstParts } from '@/lib/utils/kst';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function durationLabel(startedAt: string, endedAt: string): string {
  const minutes = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000);
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간${m > 0 ? ` ${m}분` : ''}` : `${m}분`;
}

/**
 * 멘토 케이스 화면의 회차 표 (2026-09-29) — 회차마다 한 줄.
 *  - 미등록 행: [N차 예정 등록] 버튼 → 레이어 팝업(RoundForm). 번호는 서버가 순서대로 매기므로 다음 차례 행만 눌린다
 *  - 등록 행: "N회차" 박스 + 방법 / 날짜 / 시간 / 금액 / 보고서 현황 + [일정 수정] [보고서 업로드] (+ 상세 펼치기)
 * 버튼 조건은 서버 게이트와 같다: 일정 수정·삭제 = 보고서 전·정산 전·본인 회차(updatePlannedRound), 보고서 업로드 = 진행 시각이 지난 회차(registerRoundReport).
 */
export function MentorRoundBoard({
  caseId,
  menteeName,
  rounds,
  maxRounds,
  editable,
  signEnabled,
  viewerMentorId,
  rates,
  participantOptions,
  lastRound,
}: {
  caseId: string;
  menteeName: string;
  rounds: RoundItem[];
  maxRounds: number;
  editable: boolean;
  signEnabled: boolean;
  viewerMentorId: string;
  rates: { online: number | null; offline: number | null };
  participantOptions: ParticipantOption[];
  lastRound: LastRoundDefaults | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoundItem | null>(null);
  const byNo = new Map(rounds.map((r) => [r.round_no, r]));
  const rowCount = Math.max(maxRounds, rounds.length ? rounds[rounds.length - 1]!.round_no : 0);
  const nextNo = rounds.length + 1;
  const last = rounds[rounds.length - 1] ?? null;
  const now = Date.now();

  const remove = (r: RoundItem) => {
    if (!confirm(`${r.round_no}회차를 삭제할까요?${r.report_registered_at ? ' 사진·보고서 파일도 함께 삭제됩니다.' : ''}`)) return;
    start(async () => {
      const res = r.report_registered_at ? await deleteRoundAction(caseId, r.id) : await deletePlannedRoundAction(caseId, r.id);
      toast(res.ok ? { title: '삭제했습니다.' } : { title: res.error, variant: 'destructive' });
      if (res.ok) router.refresh();
    });
  };

  return (
    <>
      <ol className="flex flex-col gap-2">
        {Array.from({ length: rowCount }, (_, i) => i + 1).map((no) => {
          const r = byNo.get(no);
          if (!r) {
            return (
              <li key={`empty-${no}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/20 p-2.5">
                {editable ? (
                  <RoundForm
                    caseId={caseId}
                    nextRoundNo={nextNo}
                    maxRounds={maxRounds}
                    rates={rates}
                    participantOptions={participantOptions}
                    lastRound={lastRound}
                    triggerLabel={`${no}차 예정 등록`}
                    disabled={no !== nextNo}
                    disabledHint={`${nextNo}차부터 순서대로 등록합니다.`}
                  />
                ) : (
                  <span className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground">{no}회차 · 미등록</span>
                )}
                {editable && no !== nextNo && <span className="text-xs text-muted-foreground">앞 회차를 먼저 등록하면 열립니다.</span>}
              </li>
            );
          }
          const reported = !!r.report_registered_at;
          const future = new Date(r.started_at).getTime() > now;
          const own = r.mentor_id === viewerMentorId;
          const canEditSchedule = editable && !reported && !r.locked && own;
          const canUpload = editable && !reported && !r.locked && !future && own;
          const canDelete = editable && !r.locked && own && (r.id === last?.id || !reported);
          const participants = (Array.isArray(r.participants) ? r.participants : []) as { name: string; role: string }[];
          const weekday = WEEKDAYS[toKstParts(r.started_at)?.weekday ?? 0];
          const open = expanded === r.id;
          return (
            <li key={r.id} className={cn('rounded-lg border bg-background p-2.5', reported && 'border-emerald-300/70')}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="rounded-md border-2 border-primary bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                  {r.round_no}회차{r.is_extra ? ' (추가)' : ''}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <b>{roundModeLabel(r.mode)}</b>
                  <span className="text-muted-foreground">/</span>
                  <span className="tabular-nums">{kstMd(r.started_at)}({weekday})</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="tabular-nums">
                    {kstHm(r.started_at)}~{kstHm(r.ended_at)}
                    {durationLabel(r.started_at, r.ended_at) && <span className="ml-1 text-xs text-primary">({durationLabel(r.started_at, r.ended_at)})</span>}
                  </span>
                  <span className="text-muted-foreground">/</span>
                  <span className="tabular-nums">{Number(r.amount_snapshot).toLocaleString('ko-KR')}원</span>
                  <span className="text-muted-foreground">/</span>
                  {reported ? (
                    r.report?.url ? (
                      <a href={r.report.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:underline">
                        <FileText className="h-3 w-3" /> 보고서 등록됨
                      </a>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">보고서 등록됨</span>
                    )
                  ) : future ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">예정 (진행 전)</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">보고서 대기</span>
                  )}
                  {signEnabled && reported && (r.mentee_signed_at ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800"><PenLine className="h-3 w-3" /> 멘티 서명</span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">서명 대기</span>
                  ))}
                  {r.locked && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /> 정산 포함</span>}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                  {editable && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canEditSchedule || pending}
                      title={canEditSchedule ? undefined : reported ? '보고서를 올린 회차는 일정을 바꿀 수 없습니다. 바꿔야 하면 운영사에 정정을 요청하세요.' : '이 회차는 수정할 수 없습니다.'}
                      onClick={() => setEditing(r)}
                    >
                      일정 수정
                    </Button>
                  )}
                  {editable && !reported && (
                    canUpload ? (
                      <RoundReportForm
                        caseId={caseId}
                        logId={r.id}
                        roundNo={r.round_no}
                        dialog
                        triggerLabel="보고서 업로드"
                        savedNameBase={roundReportFileName({ mentorName: r.mentorName, menteeName, roundNo: r.round_no, mode: r.mode })}
                      />
                    ) : (
                      <Button size="sm" disabled title={future ? '멘토링을 진행한 뒤(예정 시각 이후) 올릴 수 있습니다.' : '이 회차는 올릴 수 없습니다.'}>
                        보고서 업로드
                      </Button>
                    )
                  )}
                  <Button size="sm" variant="ghost" className="gap-0.5 px-2 text-xs" aria-expanded={open} onClick={() => setExpanded(open ? null : r.id)}>
                    상세 {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                </span>
              </div>
              {open && (
                <div className="mt-2 flex flex-col gap-2 border-t pt-2 text-sm">
                  {r.place && <p className="text-muted-foreground">{r.mode === 'online' ? '온라인 도구' : '장소'}: {r.place}</p>}
                  {participants.length > 0 && (
                    <p className="text-xs text-muted-foreground">참가자: {participants.map((p) => `${p.name}${p.role === 'member' ? '(팀원)' : '(대표)'}`).join(' · ')}</p>
                  )}
                  {r.topic && <p className="font-medium">{r.topic}</p>}
                  {r.content && <p className="whitespace-pre-wrap">{r.content}</p>}
                  {r.result && <p className="whitespace-pre-wrap text-muted-foreground">결과: {r.result}</p>}
                  {r.report && (
                    <a href={r.report.url ?? '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <FileText className="h-4 w-4" /> {r.report.name}
                    </a>
                  )}
                  {r.photos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {r.photos.map((p) =>
                        p.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.name} className="h-20 w-20 rounded-md object-cover" /></a>
                        ) : null,
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {editable && reported && !r.mentee_signed_at && !r.locked && own && (
                      <RoundReportForm
                        caseId={caseId}
                        logId={r.id}
                        roundNo={r.round_no}
                        edit={{ kind: r.report_kind === 'file' ? 'file' : 'web', topic: r.topic ?? '', content: r.content ?? '', result: r.result ?? '', place: r.place ?? '' }}
                      />
                    )}
                    {signEnabled && editable && reported && !r.mentee_signed_at && !r.locked && <CollectSignature caseId={caseId} logId={r.id} roundNo={r.round_no} />}
                    {canDelete && (
                      <Button size="sm" variant="ghost" className="gap-1 text-status-rejected" disabled={pending} onClick={() => remove(r)}>
                        <Trash2 className="h-4 w-4" /> 회차 삭제
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">진행 멘토 {r.mentorName ?? '-'}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">{editing ? `${editing.round_no}회차 일정 수정` : '일정 수정'}</DialogTitle>
            <DialogDescription className="sr-only">일자·시간·방법·장소를 고칩니다.</DialogDescription>
          </DialogHeader>
          {editing && <PlannedRoundEditor caseId={caseId} round={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
