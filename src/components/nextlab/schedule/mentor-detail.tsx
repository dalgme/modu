import { cn } from '@/lib/utils';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { MenteeCell } from '@/components/nextlab/schedule/round-people';
import { RoundStatusBadge } from '@/components/nextlab/schedule/status-legend';
import {
  MODE_LABEL,
  UNREGISTERED_STYLE,
  dateWithWeekday,
  summaryText,
  timeRange,
  type DetailMentee,
  type DetailSummary,
} from '@/lib/data/staff-schedule-shared';

const CARDS: { key: keyof DetailSummary; label: string; hint: string; tone: string }[] = [
  { key: 'plan', label: '계획', hint: '담당 멘티 목표 회차 합', tone: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40' },
  { key: 'scheduled', label: '예정', hint: '등록됐고 진행 전', tone: 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40' },
  { key: 'pending', label: '보고서 대기', hint: '진행 시각 지남 · 보고서 미등록', tone: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40' },
  { key: 'done', label: '완료', hint: '보고서 등록', tone: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40' },
  { key: 'unregistered', label: '미등록', hint: '계획 − 등록 회차', tone: 'border-dashed border-muted-foreground/40 bg-muted/40' },
];

function statusShort(s: string): string {
  return (CASE_STATUS_META as Record<string, { short: string } | undefined>)[s as CaseStatus]?.short ?? s;
}

/** 세부일정 정보 — 멘토 1명의 요약 카드 + 멘티별·회차별 표 (서버 컴포넌트) */
export function MentorDetail({ mentorName, summary, mentees, showGroup }: { mentorName: string; summary: DetailSummary; mentees: DetailMentee[]; showGroup: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold">{mentorName} 멘토 세부일정</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{summaryText(summary)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CARDS.map((c) => (
          <div key={c.key} className={cn('rounded-xl border p-3', c.tone)}>
            <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-bold tabular-nums">
              {summary[c.key]}
              <span className="ml-0.5 text-sm font-semibold">건</span>
            </p>
            <p className="text-[11px] text-muted-foreground">{c.hint}</p>
          </div>
        ))}
      </div>
      {summary.previousDone > 0 && (
        <p className="text-xs text-muted-foreground">
          이전 담당(교체·중도 종료) 멘티에서 이 멘토가 완료한 회차 <b>{summary.previousDone}건</b>은 위 집계에서 빼고 아래 표에만 표시합니다.
        </p>
      )}

      {mentees.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">이 범위에서 담당 중인 멘티가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">멘티</th>
                <th className="px-3 py-2 text-left font-semibold">회차</th>
                <th className="px-3 py-2 text-left font-semibold">날짜(요일)</th>
                <th className="px-3 py-2 text-left font-semibold">예약(완료) 시간</th>
                <th className="px-3 py-2 text-left font-semibold">방법</th>
                <th className="px-3 py-2 text-left font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {mentees.map((m) =>
                m.rows.map((row, i) => (
                  <tr key={`${m.caseId}-${row.round?.id ?? `u${row.roundNo}`}`} className={cn('align-top', i === 0 ? 'border-t-2' : 'border-t border-dashed', !m.current && 'bg-muted/20')}>
                    {i === 0 && (
                      <td rowSpan={m.rows.length} className="border-r px-3 py-2.5">
                        <MenteeCell
                          caseId={m.caseId}
                          label={m.menteeLabel}
                          phone={m.menteePhone}
                          sub={[showGroup ? m.groupName : '', statusShort(m.caseStatus), m.current ? `목표 ${m.requiredTotal}회` : '이전 담당'].filter(Boolean).join(' · ')}
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2 font-semibold tabular-nums">{row.roundNo}회차</td>
                    {row.kind === 'unregistered' || !row.round ? (
                      <>
                        <td className="px-3 py-2 text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-muted-foreground">—</td>
                        <td className="px-3 py-2">
                          <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none', UNREGISTERED_STYLE)}>미등록</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{dateWithWeekday(row.round.startedAt)}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{timeRange(row.round.startedAt, row.round.endedAt)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{MODE_LABEL[row.round.mode]}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <RoundStatusBadge status={row.round.status} />
                            {row.byOtherMentor && <span className="text-[11px] text-muted-foreground">이전 멘토 {row.round.mentorName}</span>}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
