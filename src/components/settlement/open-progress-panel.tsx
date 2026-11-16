'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquare, Search } from 'lucide-react';

import type { OpenProgressRow } from '@/lib/settlement/settlement-board';
import { StatusBadge } from '@/components/cases/status-badge';
import { ContactLinks } from '@/components/common/contact-links';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { formatKRW } from '@/lib/utils/format';
import { hoursText } from '@/lib/settlement/hours-text';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'open' | 'others' | 'unsettled';

const kstDay = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '.') : '-');

/**
 * (2026-11-16) 정산·품의 화면 하단 — 아직 검수·정산에 들어오지 않은 멘티와 진행 멘토.
 * 진행 중 단계 멘티 + 멘토가 바뀌어 정산에 안 올라온 잔여 회차가 있는 멘티. 체크해서 문자 발송 화면으로 넘긴다.
 */
export function OpenProgressPanel({ rows, canSms }: { rows: OpenProgressRow[]; canSms: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const counts = useMemo(
    () => ({
      all: rows.length,
      open: rows.filter((r) => r.reason === 'open').length,
      others: rows.filter((r) => r.otherMentorUnsettled.length > 0).length,
      unsettled: rows.filter((r) => r.unsettledRounds > 0).length,
    }),
    [rows],
  );
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'open' && r.reason !== 'open') return false;
      if (filter === 'others' && r.otherMentorUnsettled.length === 0) return false;
      if (filter === 'unsettled' && r.unsettledRounds === 0) return false;
      if (!k) return true;
      return [r.menteeName, r.mentorName ?? '', r.groupName ?? '', ...r.otherMentorUnsettled.map((o) => o.name)].some((v) => v.toLowerCase().includes(k));
    });
  }, [rows, q, filter]);

  const allShownPicked = shown.length > 0 && shown.every((r) => picked.has(r.caseId));
  const toggleAll = () => {
    const next = new Set(picked);
    if (allShownPicked) for (const r of shown) next.delete(r.caseId);
    else for (const r of shown) next.add(r.caseId);
    setPicked(next);
  };
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const pickedRows = rows.filter((r) => picked.has(r.caseId));
  const mentorIds = Array.from(new Set(pickedRows.flatMap((r) => [r.mentorId, ...r.otherMentorUnsettled.map((o) => o.mentorId)]).filter((x): x is string => !!x)));
  const menteeIds = Array.from(new Set(pickedRows.map((r) => r.menteeId).filter((x): x is string => !!x)));
  const sendTo = (ids: string[]) => {
    if (ids.length === 0) {
      toast({ title: '받는 사람이 없습니다. 목록에서 체크하세요.', variant: 'destructive' });
      return;
    }
    if (ids.length > 300) {
      toast({ title: '한 번에 300명까지 보낼 수 있습니다. 선택을 줄여 주세요.', variant: 'destructive' });
      return;
    }
    router.push(`/admin/settings/sms?tab=send&to=${ids.join(',')}`);
  };

  const chip = (key: Filter, label: string, n: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', filter === key ? 'bg-midnight text-white' : 'bg-muted hover:bg-accent')}
    >
      {label} <span className="tabular-nums">{n}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {chip('all', '전체', counts.all)}
        {chip('open', '진행 중', counts.open)}
        {chip('unsettled', '보고서 등록·미정산 회차 있음', counts.unsettled)}
        {chip('others', '멘토 변경 잔여 회차', counts.others)}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="멘티·멘토·그룹 검색" className="h-9 w-56 pl-8" />
        </div>
      </div>
      {canSms && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 text-sm backdrop-blur">
          <span>
            선택 <b className="tabular-nums">{picked.size}</b>명
          </span>
          <Button size="sm" variant="outline" className="gap-1" disabled={picked.size === 0} onClick={() => sendTo(mentorIds)}>
            <MessageSquare className="h-4 w-4" /> 진행 멘토에게 문자 ({mentorIds.length})
          </Button>
          <Button size="sm" variant="outline" className="gap-1" disabled={picked.size === 0} onClick={() => sendTo(menteeIds)}>
            <MessageSquare className="h-4 w-4" /> 멘티에게 문자 ({menteeIds.length})
          </Button>
          <Button size="sm" variant="outline" className="gap-1" disabled={picked.size === 0} onClick={() => sendTo(Array.from(new Set([...mentorIds, ...menteeIds])))}>
            <MessageSquare className="h-4 w-4" /> 멘토+멘티 모두
          </Button>
          {picked.size > 0 && (
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setPicked(new Set())}>
              선택 해제
            </button>
          )}
          <span className="text-[11px] text-muted-foreground">문자 발송 화면으로 넘어가 받는 사람이 미리 선택됩니다. {'{name}'} 등 자동 기입 필드를 쓸 수 있습니다.</span>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              {canSms && (
                <th className="w-8 px-2 py-2">
                  <input type="checkbox" aria-label="보이는 행 모두 선택" checked={allShownPicked} onChange={toggleAll} />
                </th>
              )}
              <th className="px-2 py-2 text-right">연번</th>
              <th className="px-3 py-2">멘티</th>
              <th className="hidden px-3 py-2 md:table-cell">그룹</th>
              <th className="px-3 py-2">진행 멘토</th>
              <th className="px-3 py-2">단계</th>
              <th className="px-3 py-2 text-right">보고서 / 등록 / 회차</th>
              <th className="px-3 py-2 text-right">미정산 회차</th>
              <th className="hidden px-3 py-2 text-right md:table-cell">진행 시간</th>
              <th className="hidden px-3 py-2 md:table-cell">최근 회차</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">
                  {rows.length === 0 ? '검수·정산 전인 멘티가 없습니다.' : '조건에 맞는 멘티가 없습니다.'}
                </td>
              </tr>
            )}
            {shown.map((r, i) => (
              <tr key={r.caseId} className={cn('border-b align-top last:border-0', picked.has(r.caseId) && 'bg-primary/5')}>
                {canSms && (
                  <td className="px-2 py-2">
                    <input type="checkbox" aria-label={`${r.menteeName} 선택`} checked={picked.has(r.caseId)} onChange={() => toggle(r.caseId)} />
                  </td>
                )}
                <td className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">{r.menteeName}</p>
                  {r.menteePhone && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {r.menteePhone} <ContactLinks phone={r.menteePhone} name={r.menteeName} size="xs" />
                    </span>
                  )}
                  {r.outcomeLabel && <span className="mt-0.5 inline-block rounded bg-rose-100 px-1.5 text-[11px] font-semibold text-rose-700">{r.outcomeLabel}</span>}
                </td>
                <td className="hidden px-3 py-2 text-xs md:table-cell">{r.groupName ?? '-'}</td>
                <td className="px-3 py-2">
                  <p className={cn('font-medium', !r.mentorActive && 'text-muted-foreground')}>{r.mentorName ?? '미배정'}</p>
                  {r.mentorPhone && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {r.mentorPhone} <ContactLinks phone={r.mentorPhone} name={r.mentorName ?? undefined} size="xs" />
                    </span>
                  )}
                  {r.otherMentorUnsettled.map((o) => (
                    <p key={o.mentorId} className="mt-0.5 text-[11px] font-semibold text-violet-700">
                      이전 멘토 {o.name} · 미정산 {o.rounds}회
                    </p>
                  ))}
                </td>
                <td className="px-3 py-2 text-xs">
                  <StatusBadge status={r.status} short />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <b>{r.reported}</b> / {r.planned} / {r.requiredRounds}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.unsettledRounds > 0 ? (
                    <>
                      <b className="text-amber-700">{r.unsettledRounds}회</b>
                      <p className="text-[11px] text-muted-foreground">예상 {formatKRW(r.unsettledAmount)}</p>
                    </>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="hidden px-3 py-2 text-right text-xs tabular-nums md:table-cell">{hoursText(r.reportedMinutes)}</td>
                <td className="hidden px-3 py-2 text-xs tabular-nums md:table-cell">{kstDay(r.lastRoundAt)}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/nextlab/cases/${r.caseId}`} className="whitespace-nowrap text-xs text-primary hover:underline">
                    케이스 →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        보고서 / 등록 / 회차 = 보고서까지 올린 회차 / 일정 등록된 회차 / 라운드 회차 수. 미정산 회차 = 보고서는 올렸지만 아직 정산(검수 승인·부분 정산)에 들어가지 않은 회차, 예상 금액은 세전 수당입니다. 진행 시간 = 보고서 등록 회차 합계.
      </p>
    </div>
  );
}
