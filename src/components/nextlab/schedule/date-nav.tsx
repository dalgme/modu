'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { dayTitle, shiftYmd } from '@/lib/data/staff-schedule-shared';

/** 오늘의 멘토링 — [어제] [오늘] [내일] + 날짜 선택 (?date=YYYY-MM-DD). today 는 서버가 KST 로 계산해 내려준다. */
export function DateNav({ date, today, basePath }: { date: string; today: string; basePath: string }) {
  const router = useRouter();
  const href = (d: string) => `${basePath}${basePath.includes('?') ? '&' : '?'}date=${d}`;
  const btn = 'inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-semibold hover:bg-accent';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={href(shiftYmd(date, -1))} className={btn} aria-label="하루 전">{date === today ? '어제' : '전날'}</Link>
      <Link href={href(today)} className={cn(btn, date === today && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90')}>오늘</Link>
      <Link href={href(shiftYmd(date, 1))} className={btn} aria-label="하루 뒤">{date === today ? '내일' : '다음날'}</Link>
      <input
        type="date"
        value={date}
        onChange={(e) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) router.push(href(e.target.value));
        }}
        className="h-9 rounded-lg border bg-background px-2 text-base sm:text-sm"
        aria-label="날짜 선택"
      />
      <span className="ml-1 text-base font-bold">{dayTitle(date)}</span>
      {date === today && <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">오늘</span>}
    </div>
  );
}
