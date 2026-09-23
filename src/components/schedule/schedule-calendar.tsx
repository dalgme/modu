'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { ScheduleEvent } from '@/lib/data/schedule';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { menteeLabel } from '@/lib/utils/labels';

type View = 'month' | 'week' | 'day';

const DAY_MS = 24 * 3600 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return new Date(x.getTime() - x.getDay() * DAY_MS);
}

/** 이벤트 상태: 완료(보고서 등록) / 예약(미래) / 실행(지난 일정, 보고서 대기) */
function statusOf(e: ScheduleEvent): 'done' | 'planned' | 'pending' {
  if (e.reported) return 'done';
  return new Date(e.startedAt).getTime() > Date.now() ? 'planned' : 'pending';
}

const STATUS_STYLE: Record<ReturnType<typeof statusOf>, string> = {
  done: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700',
  planned: 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-700',
  pending: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700',
};
const STATUS_LABEL = { done: '완료', planned: '예약', pending: '보고서 대기' } as const;

/**
 * 컨설팅 스케줄 달력 (P20) — 월/주/일 보기. 멘토·멘티 화면 공용.
 * caseHrefBase 를 주면 이벤트 클릭 → 케이스 상세로 이동.
 */
export function ScheduleCalendar({ events, caseHrefBase }: { events: ScheduleEvent[]; caseHrefBase?: string }) {
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(() => new Date());

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      const key = ymd(new Date(e.startedAt));
      (m.get(key) ?? m.set(key, []).get(key)!).push(e);
    }
    return m;
  }, [events]);

  const move = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else if (view === 'week') d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setAnchor(d);
  };

  const title =
    view === 'month'
      ? `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월`
      : view === 'week'
        ? (() => {
            const s = startOfWeek(anchor);
            const e = new Date(s.getTime() + 6 * DAY_MS);
            return `${s.getMonth() + 1}/${s.getDate()} ~ ${e.getMonth() + 1}/${e.getDate()}`;
          })()
        : `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월 ${anchor.getDate()}일 (${WEEKDAYS[anchor.getDay()]})`;

  const EventChip = ({ e, full = false }: { e: ScheduleEvent; full?: boolean }) => {
    const st = statusOf(e);
    const inner = (
      <span className={cn('block truncate rounded border px-1.5 py-0.5 text-[11px] leading-snug', STATUS_STYLE[st], full && 'flex flex-wrap items-center gap-1 px-2 py-1.5 text-xs')}>
        <b>{hm(e.startedAt)}</b> {menteeLabel(e.ownerName, e.businessName)} · {e.mode === 'online' ? '온라인' : '오프라인'}
        {full && (
          <>
            <span>~{hm(e.endedAt)}</span>
            {e.place && <span>· {e.place}</span>}
            {e.mentorName && <span>· 멘토 {e.mentorName}</span>}
            <span className="font-semibold">[{STATUS_LABEL[st]}]</span>
          </>
        )}
      </span>
    );
    return caseHrefBase ? <Link href={`${caseHrefBase}/${e.caseId}`}>{inner}</Link> : inner;
  };

  const today = ymd(new Date());

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => move(-1)} aria-label="이전"><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>오늘</Button>
          <Button size="sm" variant="outline" onClick={() => move(1)} aria-label="다음"><ChevronRight className="h-4 w-4" /></Button>
          <span className="ml-2 text-base font-bold">{title}</span>
        </div>
        <div className="flex gap-1">
          {(['month', 'week', 'day'] as View[]).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold', view === v ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent')}>
              {v === 'month' ? '월' : v === 'week' ? '주' : '일'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-sky-300 bg-sky-100" />예약(계획)</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-100" />실행 — 보고서 대기</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-100" />완료(보고서 등록)</span>
      </div>

      {view === 'month' && (() => {
        const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        const gridStart = startOfWeek(first);
        const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * DAY_MS));
        return (
          <div className="overflow-hidden rounded-xl border-2 bg-background">
            <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-semibold">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className={cn('py-1.5', i === 0 && 'text-red-600', i === 6 && 'text-blue-600')}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((d) => {
                const key = ymd(d);
                const inMonth = d.getMonth() === anchor.getMonth();
                const dayEvents = byDate.get(key) ?? [];
                return (
                  <div key={key} className={cn('min-h-[84px] border-b border-r p-1 last:border-r-0', !inMonth && 'bg-muted/30 text-muted-foreground', key === today && 'bg-primary/5')}>
                    <button type="button" onClick={() => { setAnchor(new Date(d)); setView('day'); }} className={cn('mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold hover:bg-accent', key === today && 'bg-primary text-primary-foreground')}>
                      {d.getDate()}
                    </button>
                    <div className="flex flex-col gap-0.5">
                      {dayEvents.slice(0, 3).map((e) => <EventChip key={e.id} e={e} />)}
                      {dayEvents.length > 3 && (
                        <button type="button" onClick={() => { setAnchor(new Date(d)); setView('day'); }} className="text-left text-[10px] text-muted-foreground hover:underline">
                          +{dayEvents.length - 3}건 더보기
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {view === 'week' && (() => {
        const s = startOfWeek(anchor);
        const days = Array.from({ length: 7 }, (_, i) => new Date(s.getTime() + i * DAY_MS));
        return (
          <div className="flex flex-col gap-2">
            {days.map((d) => {
              const key = ymd(d);
              const dayEvents = byDate.get(key) ?? [];
              return (
                <div key={key} className={cn('rounded-xl border-2 bg-background p-3', key === today && 'border-primary/50')}>
                  <p className={cn('mb-1.5 text-sm font-bold', d.getDay() === 0 && 'text-red-600', d.getDay() === 6 && 'text-blue-600')}>
                    {d.getMonth() + 1}/{d.getDate()} ({WEEKDAYS[d.getDay()]}){key === today && <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">오늘</span>}
                  </p>
                  {dayEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">일정 없음</p>
                  ) : (
                    <div className="flex flex-col gap-1">{dayEvents.map((e) => <EventChip key={e.id} e={e} full />)}</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {view === 'day' && (() => {
        const dayEvents = byDate.get(ymd(anchor)) ?? [];
        return (
          <div className="rounded-xl border-2 bg-background p-4">
            {dayEvents.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">이 날의 컨설팅 일정이 없습니다.</p>
            ) : (
              <div className="flex flex-col gap-2">{dayEvents.map((e) => <EventChip key={e.id} e={e} full />)}</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
