import Link from 'next/link';

import { END_KIND_LABEL, MENTOR_HISTORY_STATUS_LABEL, type MentorHistoryItem } from '@/lib/data/mentor-history-shared';
import { formatDate, formatKRW } from '@/lib/utils/format';
import { roundTimeRangeLabel } from '@/lib/workflow/round-time';
import { hoursText, minutesOf } from '@/lib/workflow/extension-rule';
import { cn } from '@/lib/utils';

const STATUS_CLS: Record<MentorHistoryItem['status'], string> = {
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  confirmed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200',
  batched: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  none: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
};

/**
 * 멘토 대시보드 — 정산·종료된 멘토링 내역 (2026-11-25).
 * 끝난 담당(종결·중도 종료·멘토 변경 등)도 사라지지 않게, 내가 진행한 회차와 내 정산 상태를 계속 보여 준다.
 * 끝까지 담당한 케이스는 카드에서 케이스 화면으로, 중간에 끝난 담당은 이 카드에서 내 회차만 본다. 서버 컴포넌트(훅 없음).
 */
export function MentorHistorySection({ items, basePath, settlementsHref }: { items: MentorHistoryItem[]; basePath: string; settlementsHref: string }) {
  if (items.length === 0) return null;
  const totalNet = items.reduce((s, i) => s + i.settlements.reduce((a, x) => a + x.net, 0), 0);
  return (
    <details open className="rounded-xl border bg-background">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        정산·종료된 멘토링 내역 <span className="font-normal text-muted-foreground">({items.length}) — 종결·중도 종료·멘토 변경으로 끝난 담당도 여기서 내 회차와 정산 상태를 다시 볼 수 있습니다 · 확정 실지급 합계 {formatKRW(totalNet)}</span>
      </summary>
      <ul className="grid gap-2 px-4 pb-4 md:grid-cols-2">
        {items.map((it) => {
          const minutes = it.rounds.reduce((s, r) => s + minutesOf(r.startedAt, r.endedAt), 0);
          const net = it.settlements.reduce((s, x) => s + x.net, 0);
          return (
            <li key={it.caseId} className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {it.canOpenCase ? (
                  <Link href={`${basePath}/${it.caseId}`} className="font-medium text-primary hover:underline">{it.menteeName}</Link>
                ) : (
                  <span className="font-medium">{it.menteeName}</span>
                )}
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CLS[it.status])}>{MENTOR_HISTORY_STATUS_LABEL[it.status]}</span>
                {it.endKind && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{END_KIND_LABEL[it.endKind] ?? it.endKind}</span>}
              </div>
              <p className="text-xs text-muted-foreground">
                {it.groupName ?? '-'} · 내가 진행한 회차 {it.rounds.length}회 · {hoursText(minutes)}
                {it.endedAt ? ` · ${formatDate(it.endedAt)} 종료` : ''}
                {net > 0 ? ` · 확정 실지급 ${formatKRW(net)}` : ''}
              </p>
              {it.rounds.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-primary">회차 내역 보기</summary>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {it.rounds.map((r) => (
                      <li key={r.roundNo} className="flex flex-wrap gap-x-2">
                        <b className="tabular-nums">{r.roundNo}회차</b>
                        <span>{formatDate(r.startedAt)} {roundTimeRangeLabel(r.startedAt, r.endedAt)}</span>
                        <span>{r.mode === 'online' ? '온라인' : '오프라인'}</span>
                        <span className="tabular-nums">{formatKRW(r.amount)}</span>
                        <span className={r.settled ? 'text-emerald-700' : r.reported ? 'text-amber-700' : 'text-muted-foreground'}>{r.settled ? '정산됨' : r.reported ? '보고서 등록 · 정산 전' : '보고서 없음'}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="flex flex-wrap gap-3 text-xs">
                {it.canOpenCase && <Link href={`${basePath}/${it.caseId}`} className="text-primary underline">멘티 화면(회차·보고서) 보기</Link>}
                <Link href={settlementsHref} className="text-muted-foreground underline">내 정산 내역</Link>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
