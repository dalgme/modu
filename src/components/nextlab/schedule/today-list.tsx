'use client';

import { useMemo, useState } from 'react';
import { CalendarX2, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/common/empty-state';
import { MenteeCell, MentorCell } from '@/components/nextlab/schedule/round-people';
import { RoundStatusBadge } from '@/components/nextlab/schedule/status-legend';
import { MODE_LABEL, countByStatus, matchesRoundSearch, timeRange, type StaffRound } from '@/lib/data/staff-schedule-shared';

/** 오늘의 멘토링 리스트 — 선택한 날짜의 회차. 검색은 화면 안(이름·휴대폰) */
export function TodayList({ rows, showGroup }: { rows: StaffRound[]; showGroup: boolean }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => rows.filter((r) => matchesRoundSearch(r, q)), [rows, q]);
  const c = countByStatus(rows);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          총 <b className="tabular-nums">{rows.length}</b>건 — 예약 <b className="tabular-nums">{c.planned}</b> · 보고서 대기 <b className="tabular-nums">{c.pending}</b> · 완료 <b className="tabular-nums">{c.done}</b>
        </p>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="멘티·멘토 이름, 휴대폰 검색" className="pl-8" aria-label="목록 검색" />
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={CalendarX2} title="이 날짜에 등록된 멘토링이 없습니다." hint="멘토가 회차 계획(1단계)을 등록하면 여기 표시됩니다." compact />
      ) : shown.length === 0 ? (
        <EmptyState icon={Search} title="검색 결과가 없습니다." compact />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="w-12 px-3 py-2 text-center font-semibold">연번</th>
                <th className="px-3 py-2 text-left font-semibold">멘티명(연락처)</th>
                <th className="px-3 py-2 text-left font-semibold">회차</th>
                <th className="px-3 py-2 text-left font-semibold">예약(완료) 시간</th>
                <th className="px-3 py-2 text-left font-semibold">멘토명(연락처)</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <MenteeCell caseId={r.caseId} label={r.menteeLabel} phone={r.menteePhone} sub={showGroup ? r.groupName : undefined} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <b className="tabular-nums">{r.roundNo}회차</b>
                    <span className="text-xs text-muted-foreground"> / {r.requiredTotal}회</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="whitespace-nowrap font-semibold tabular-nums">{timeRange(r.startedAt, r.endedAt)}</span>
                      <RoundStatusBadge status={r.status} />
                    </div>
                    <span className="text-[11px] text-muted-foreground">{MODE_LABEL[r.mode]}{r.place ? ` · ${r.place}` : ''}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <MentorCell name={r.mentorName} phone={r.mentorPhone} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
