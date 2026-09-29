'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { KST_WEEKDAYS } from '@/lib/utils/kst';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MenteeCell, MentorCell } from '@/components/nextlab/schedule/round-people';
import { RoundStatusBadge } from '@/components/nextlab/schedule/status-legend';
import {
  ROUND_STATUS_LABEL,
  ROUND_STATUS_STYLE,
  countByStatus,
  dayTitle,
  groupByDay,
  monthGrid,
  monthTitle,
  timeRange,
  type RoundStatus,
  type StaffRound,
} from '@/lib/data/staff-schedule-shared';

/**
 * 전체 달력 — 구글 캘린더식 월 격자. 칸마다 "예약 n · 완료 m (· 대기 k)" 건수, 누르면 그날 목록 팝업.
 * rows = 이 달(month) 의 회차만. 월 이동은 서버가 만든 링크(?month=).
 */
export function MonthCountCalendar({ month, today, rows, prevHref, nextHref, todayHref, showGroup }: { month: string; today: string; rows: StaffRound[]; prevHref: string; nextHref: string; todayHref: string; showGroup: boolean }) {
  const cells = useMemo(() => monthGrid(month), [month]);
  const byDay = useMemo(() => groupByDay(rows), [rows]);
  const [open, setOpen] = useState<{ ymd: string; status: RoundStatus | null } | null>(null);
  const total = countByStatus(rows);

  const openList = open ? (byDay[open.ymd] ?? []).filter((r) => !open.status || r.status === open.status) : [];

  const countBtn = (ymd: string, status: RoundStatus, n: number) =>
    n > 0 && (
      <button
        key={status}
        type="button"
        onClick={() => setOpen({ ymd, status })}
        className={cn('block w-full truncate rounded border px-1 py-0.5 text-left text-[11px] font-semibold leading-snug hover:brightness-95', ROUND_STATUS_STYLE[status])}
      >
        {status === 'pending' ? '대기' : ROUND_STATUS_LABEL[status]} {n}
      </button>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Link href={prevHref} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-background hover:bg-accent" aria-label="이전 달"><ChevronLeft className="h-4 w-4" /></Link>
          <Link href={todayHref} className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-semibold hover:bg-accent">이번 달</Link>
          <Link href={nextHref} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-background hover:bg-accent" aria-label="다음 달"><ChevronRight className="h-4 w-4" /></Link>
          <span className="ml-2 text-base font-bold">{monthTitle(month)}</span>
        </div>
        <p className="text-sm">
          이 달 {rows.length}건 — 예약 <b className="tabular-nums">{total.planned}</b> · 보고서 대기 <b className="tabular-nums">{total.pending}</b> · 완료 <b className="tabular-nums">{total.done}</b>
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border-2 bg-background">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-semibold">
          {KST_WEEKDAYS.map((w, i) => (
            <div key={w} className={cn('py-1.5', i === 0 && 'text-red-600', i === 6 && 'text-blue-600')}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const list = byDay[cell.ymd] ?? [];
            const c = countByStatus(list);
            return (
              <div key={cell.ymd} className={cn('min-h-[92px] border-b border-r p-1 [&:nth-child(7n)]:border-r-0', !cell.inMonth && 'bg-muted/30 text-muted-foreground', cell.ymd === today && 'bg-primary/5')}>
                <button
                  type="button"
                  disabled={list.length === 0}
                  onClick={() => setOpen({ ymd: cell.ymd, status: null })}
                  className={cn(
                    'mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold enabled:hover:bg-accent',
                    cell.weekday === 0 && 'text-red-600',
                    cell.weekday === 6 && 'text-blue-600',
                    cell.ymd === today && 'bg-primary text-primary-foreground',
                  )}
                  aria-label={list.length ? `${dayTitle(cell.ymd)} ${list.length}건 보기` : dayTitle(cell.ymd)}
                >
                  {cell.day}
                </button>
                <div className="flex flex-col gap-0.5">
                  {countBtn(cell.ymd, 'planned', c.planned)}
                  {countBtn(cell.ymd, 'pending', c.pending)}
                  {countBtn(cell.ymd, 'done', c.done)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{open ? dayTitle(open.ymd) : ''} 멘토링 {open?.status ? `· ${ROUND_STATUS_LABEL[open.status]}` : ''}</DialogTitle>
            <DialogDescription>
              {openList.length}건
              {open?.status && (
                <>
                  {' · '}
                  <button type="button" className="font-semibold text-primary underline" onClick={() => setOpen({ ymd: open.ymd, status: null })}>
                    이 날 전체 보기
                  </button>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 px-2 py-2 text-center font-semibold">연번</th>
                  <th className="px-2 py-2 text-left font-semibold">멘티명</th>
                  <th className="px-2 py-2 text-left font-semibold">회차</th>
                  <th className="px-2 py-2 text-left font-semibold">예약(종료) 시간</th>
                  <th className="px-2 py-2 text-left font-semibold">멘토명(연락처)</th>
                </tr>
              </thead>
              <tbody>
                {openList.map((r, i) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-2">
                      <MenteeCell caseId={r.caseId} label={r.menteeLabel} phone={null} sub={showGroup ? r.groupName : undefined} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <b className="tabular-nums">{r.roundNo}회차</b>
                      <span className="text-xs text-muted-foreground"> / {r.requiredTotal}회</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="whitespace-nowrap font-semibold tabular-nums">{timeRange(r.startedAt, r.endedAt)}</span>
                        <RoundStatusBadge status={r.status} />
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <MentorCell name={r.mentorName} phone={r.mentorPhone} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
