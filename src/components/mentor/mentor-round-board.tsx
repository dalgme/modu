'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Lock, Trash2 } from 'lucide-react';

import type { RoundItem } from '@/lib/data/rounds';
import { deleteRoundAction, deletePlannedRoundAction } from '@/lib/workflow/mentor-actions';
import { canMentorDeleteRound, firstEmptyRoundNo } from '@/lib/workflow/round-slots';
import { roundModeLabel, roundReportFileName } from '@/lib/workflow/round-report-name';
import { RoundForm, type LastRoundDefaults, type ParticipantOption } from '@/components/mentor/round-form';
import { RoundReportForm } from '@/components/mentor/round-report-form';
import { PlannedRoundEditor } from '@/components/mentor/rounds-list';
import { FileActions } from '@/components/files/file-preview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { kstHm, kstMd, kstYmd, toKstParts } from '@/lib/utils/kst';

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
 *  - 등록 행: "N회차" 박스 + 방법 / 날짜 / 시간 / 금액 / 보고서 현황 + [일정 수정] [보고서 업로드] / 보고서 등록 후 [미리보기]·[다운로드]·[보고서 수정 업로드]
 *    + 아래줄 바이올렛 "저장 파일명·최초/수정 등록일" (2026-09-30: 상세·현장 서명·서명 대기 표시 제거)
 * 버튼 조건은 서버 게이트와 같다: 일정 수정·삭제 = 보고서 전·정산 전·본인 회차(updatePlannedRound), 보고서 업로드 = 진행 시각이 지난 회차(registerRoundReport).
 */
export function MentorRoundBoard({
  caseId,
  menteeName,
  rounds,
  maxRounds,
  editable,
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
  viewerMentorId: string;
  rates: { online: number | null; offline: number | null };
  participantOptions: ParticipantOption[];
  lastRound: LastRoundDefaults | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<RoundItem | null>(null);
  const byNo = new Map(rounds.map((r) => [r.round_no, r]));
  const rowCount = Math.max(maxRounds, rounds.length ? rounds[rounds.length - 1]!.round_no : 0);
  // 다음 차례 = 비어 있는 가장 앞 번호 (서버 submitRound 와 같은 함수) — 중간 회차를 지우면 그 자리부터 다시 등록
  const nextNo = firstEmptyRoundNo(rounds.map((r) => r.round_no));
  const now = Date.now();

  const remove = (r: RoundItem) => {
    if (!confirm(`${r.round_no}회차를 삭제할까요?${r.report_registered_at ? `\n일정과 보고서 파일이 함께 삭제되고 ${r.round_no}회차 자리는 비워집니다. 다른 회차 번호는 그대로이며, 다음 [예정 등록]이 이 자리를 채웁니다.` : ''}`)) return;
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
          // 등록된 보고서 수정 업로드 — 정산 전·본인 회차 (replaceRoundReport 서버 게이트와 같은 조건)
          const canReplace = editable && reported && !r.locked && own;
          // 보고서 등록 회차도 각각 삭제 가능 (2026-09-30) — 서버 deleteRound 게이트와 같은 조건
          const canDelete = canMentorDeleteRound({ editable, own, locked: r.locked, menteeSigned: !!r.mentee_signed_at });
          const weekday = WEEKDAYS[toKstParts(r.started_at)?.weekday ?? 0];
          const modified = r.report?.updatedAt && Math.abs(new Date(r.report.updatedAt).getTime() - new Date(r.report.createdAt).getTime()) > 60_000 ? r.report.updatedAt : null;
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
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      <FileText className="h-3 w-3" /> 보고서 등록됨
                    </span>
                  ) : future ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">예정 (진행 전)</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">보고서 대기</span>
                  )}
                  {r.locked && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /> 정산 포함</span>}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                  {/* 회차별 보고서 파일 — 웹 미리보기·개별 다운로드 */}
                  {r.report && <FileActions docId={r.report.id} name={r.report.name} />}
                  {editable && !reported && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canEditSchedule || pending}
                      title={canEditSchedule ? undefined : '이 회차는 수정할 수 없습니다.'}
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
                  {canReplace && (
                    <RoundReportForm
                      caseId={caseId}
                      logId={r.id}
                      roundNo={r.round_no}
                      dialog
                      replace
                      triggerLabel="보고서 수정 업로드"
                      savedNameBase={roundReportFileName({ mentorName: r.mentorName, menteeName, roundNo: r.round_no, mode: r.mode })}
                    />
                  )}
                  {canDelete && (
                    <Button size="sm" variant="ghost" className="px-2 text-status-rejected" disabled={pending} onClick={() => remove(r)} title={`${r.round_no}회차 삭제`} aria-label={`${r.round_no}회차 삭제`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </span>
              </div>
              {/* 저장 파일명·최초/수정 등록일 (2026-09-30) — 바이올렛 배경 */}
              {r.report && (
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md bg-violet-100 px-3 py-1.5 text-xs text-violet-950 dark:bg-violet-950/50 dark:text-violet-100">
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <FileText className="h-3.5 w-3.5 shrink-0" /> 저장 파일명: <b className="break-all">{r.report.name}</b>
                  </span>
                  <span className="tabular-nums">최초 등록일 {kstYmd(r.report.createdAt)} {kstHm(r.report.createdAt)}</span>
                  {modified && <span className="tabular-nums">수정 등록일 {kstYmd(modified)} {kstHm(modified)}</span>}
                </p>
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
