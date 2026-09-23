'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, FileCheck2, Mail, MessageSquare, Phone, RefreshCw, Search, Undo2, UserCheck, UserSearch } from 'lucide-react';

import { ExcelButton } from '@/components/common/excel-button';
import type { MenteeMatchRow, MentorMatchRow } from '@/lib/data/matching-lists';
import { MATCH_METHOD_LABELS, type PaymentDocSetState } from '@/lib/matching/labels';
import { confirmMatchAction, manualMatchAction, rebuildRecommendationsAction } from '@/lib/matching/actions';
import { addMentorGroupReviewAction, deleteMentorGroupReviewAction, setPaymentDocSetStateAction } from '@/lib/mentors/actions';
import { reassignMentorAction, recallMentorAction } from '@/lib/workflow/case-actions';
import { matchedPairs } from '@/lib/matching/eligibility';
import { MentorName } from '@/components/common/mentor-name';
import { RoundDots } from '@/components/common/round-dots';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { mentorLabel } from '@/lib/utils/labels';
import { formatDate, formatKRW } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/** P24·P25·P27 매칭 리스트 — 멘토 기준 / 멘티 기준. 확인 여부 = 멘토가 로그인해 배정을 열람한 시각. */

function ConfirmMark({ at }: { at: string | null }) {
  return at ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-4 w-4" /> 확인 {formatDate(at)}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground">
      <Circle className="h-3.5 w-3.5" /> 미확인
    </span>
  );
}

function Chips({ items, tone = 'muted', max }: { items: string[]; tone?: 'muted' | 'amber' | 'sky'; max?: number }) {
  const list = max ? items.slice(0, max) : items;
  if (list.length === 0) return <span className="text-muted-foreground">-</span>;
  const cls = tone === 'amber' ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : tone === 'sky' ? 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200' : 'bg-muted text-foreground';
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((x, i) => (
        <span key={`${x}-${i}`} className={`rounded px-1.5 py-0.5 text-[11px] leading-tight ${cls}`}>
          {tone === 'amber' ? `${i + 1}. ` : ''}
          {x}
        </span>
      ))}
    </span>
  );
}

/** 상단 툴바 — 스카이블루 배경 (P27-04) */
function ListToolbar({ query, onQuery, exportHref, summary, extra }: { query: string; onQuery: (v: string) => void; exportHref: string; summary: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-300 bg-sky-100 px-4 py-2.5 dark:border-sky-800 dark:bg-sky-950/40">
      <div className="text-sm font-semibold text-sky-950 dark:text-sky-100">{summary}</div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {extra}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="이름 검색" className="h-9 w-44 bg-background pl-8" />
        </div>
        <ExcelButton href={exportHref} label="엑셀 다운로드" />
      </div>
    </div>
  );
}

/** 멘티 순위 배지 (P27-01) */
export function RankBadge({ rank }: { rank: number | null }) {
  if (rank === null) return <span className="text-muted-foreground">-</span>;
  return <span className="inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-md bg-midnight px-1.5 text-xs font-bold tabular-nums text-midnight-foreground">{rank}</span>;
}

/* ──────────────────────────── 지급서류 셋트 -/X/O (P27-16) ──────────────────────────── */

const DOC_STATE_DESC: Record<PaymentDocSetState, string> = {
  '-': '이 멘토의 지급서류 셋트는 여기서 체크·관리하지 않음',
  X: '이 멘토의 지급서류 셋트를 관리하기로 함 — 아직 수령하지 않음',
  O: '지급서류 셋트를 이메일 등으로 따로 수령함',
};

export function PaymentDocSetButton({ mentorId, mentorName, state, readOnly = false, size = 'sm' }: { mentorId: string; mentorName: string; state: PaymentDocSetState; readOnly?: boolean; size?: 'sm' | 'xs' }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const cls = state === 'O' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : state === 'X' ? 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'border-border bg-background text-muted-foreground';
  const apply = (next: PaymentDocSetState) => {
    start(async () => {
      const r = await setPaymentDocSetStateAction({ userId: mentorId, state: next });
      toast(r.ok ? { title: `${mentorName} 지급서류 → ${next}` } : { title: r.error, variant: 'destructive' });
      if (r.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  };
  return (
    <>
      <button
        type="button"
        disabled={readOnly || pending}
        onClick={() => setOpen(true)}
        title={`지급서류 ${state} = ${DOC_STATE_DESC[state]}${readOnly ? '' : ' — 누르면 변경 팝업'}`}
        className={cn('inline-flex items-center justify-center rounded-md border font-bold', size === 'xs' ? 'h-6 min-w-[2rem] px-1.5 text-[11px]' : 'h-7 min-w-[2.5rem] px-2 text-xs', cls, readOnly && 'cursor-default')}
      >
        {state}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>지급서류 셋트 상태 변경 — {mentorName}</DialogTitle>
            <DialogDescription>이력서·통장사본·신분증사본 3종을 한 번에 같은 상태로 둡니다. 현재: <b>{state}</b> ({DOC_STATE_DESC[state]})</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3 text-xs">
            <li><b>-</b> : {DOC_STATE_DESC['-']}</li>
            <li><b className="text-rose-700">X</b> : {DOC_STATE_DESC.X}</li>
            <li><b className="text-emerald-700">O</b> : {DOC_STATE_DESC.O}</li>
          </ul>
          <DialogFooter className="flex-wrap gap-2 sm:justify-start">
            <Button variant="outline" className="border-rose-400 text-rose-700 hover:bg-rose-50" disabled={pending || state === 'X'} onClick={() => apply('X')}>X 로 변경</Button>
            <Button variant="outline" className="border-emerald-500 text-emerald-700 hover:bg-emerald-50" disabled={pending || state === 'O'} onClick={() => apply('O')}>O 로 변경</Button>
            <Button variant="outline" disabled={pending || state === '-'} onClick={() => apply('-')}>- 로 변경</Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ──────────────────────────── 운영사 평가 (P27-19) ──────────────────────────── */

export function MentorReviewButton({ mentor, groups, currentGroupId }: { mentor: MentorMatchRow; groups: { id: string; name: string }[]; currentGroupId?: string | null }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  // 기본 그룹 = 현재 범위 그룹(범위 스위처) → 없으면 첫 그룹 (P28)
  const [groupId, setGroupId] = useState((currentGroupId && groups.some((g) => g.id === currentGroupId) ? currentGroupId : groups[0]?.id) ?? '');
  const [rating, setRating] = useState<string>('');
  const [memo, setMemo] = useState('');
  const submit = () => {
    if (!groupId) return;
    start(async () => {
      const r = await addMentorGroupReviewAction({ supportTypeId: groupId, mentorId: mentor.mentorId, rating: rating ? Number(rating) : null, memo });
      toast(r.ok ? { title: '운영사 평가를 기록했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) {
        setMemo('');
        setRating('');
        router.refresh();
      }
    });
  };
  return (
    <>
      <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setOpen(true)} title="그룹별 운영사 평가·메모 (멘토 본인 비공개, 멘토 정보에 누적)">
        <MessageSquare className="h-3.5 w-3.5" /> 운영사 평가{mentor.reviewAvg !== null ? ` ${mentor.reviewAvg}` : ''}{mentor.reviews.length > 0 ? ` (${mentor.reviews.length})` : ''}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>운영사 평가 — {mentor.mentorName}</DialogTitle>
            <DialogDescription>그룹(라운드) 단위로 평점·메모를 남깁니다. 멘토 본인에게는 보이지 않으며, 멘토 정보 팝업·리포트에 누적 반영됩니다.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">그룹</span>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">평점</span>
                <select value={rating} onChange={(e) => setRating(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="">없음</option>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}점</option>)}
                </select>
              </label>
              <Button size="sm" onClick={submit} disabled={pending || !groupId || (!rating && !memo.trim())}>{pending ? '저장 중…' : '기록'}</Button>
            </div>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="메모 (선택)" />
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">누적 기록 {mentor.reviews.length}건{mentor.reviewAvg !== null ? ` · 평균 ${mentor.reviewAvg}점` : ''}</p>
              {mentor.reviews.length === 0 ? (
                <p className="text-xs text-muted-foreground">아직 기록이 없습니다.</p>
              ) : (
                <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto text-xs">
                  {mentor.reviews.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2 py-1">
                      <span>[{r.groupName}] {r.rating ? `${r.rating}점 · ` : ''}{r.memo ?? ''} <span className="text-muted-foreground">— {r.authorName} {formatDate(r.createdAt)}</span></span>
                      <button type="button" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => start(async () => { const x = await deleteMentorGroupReviewAction(r.id); if (!x.ok) toast({ title: x.error, variant: 'destructive' }); else router.refresh(); })}>숨김</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ──────────────────────────── 멘토 매칭 리스트 ──────────────────────────── */

export function MentorMatchList({ rows, groups, currentGroupId = null, caseHrefBase = '/nextlab/cases' }: { rows: MentorMatchRow[]; groups: { id: string; name: string }[]; currentGroupId?: string | null; caseHrefBase?: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState('');
  const [reassign, setReassign] = useState<{ caseId: string; menteeLabel: string; currentMentorId: string; groupId: string; groupName: string } | null>(null);
  const [newMentorId, setNewMentorId] = useState<string | undefined>();

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? rows.filter((m) => m.mentorName.includes(q)) : rows;
  }, [rows, query]);
  const matched = rows.filter((m) => m.mentees.length > 0).length;

  const recall = (caseId: string, label: string) => {
    if (!window.confirm(`${label} 멘티의 멘토 배정을 회수하고 등록 단계로 되돌릴까요?`)) return;
    start(async () => {
      const r = await recallMentorAction(caseId);
      toast(r.ok ? { title: '배정을 회수했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });
  };
  const doReassign = () => {
    if (!reassign || !newMentorId) return;
    start(async () => {
      const r = await reassignMentorAction(reassign.caseId, newMentorId);
      toast(r.ok ? { title: '멘토를 재배정했습니다. 잔여 회차는 새 멘토가 승계합니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) {
        setReassign(null);
        setNewMentorId(undefined);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        query={query}
        onQuery={setQuery}
        exportHref="/api/nextlab/roster-export?tab=mentor-match"
        summary={
          <>
            전체 멘토 인원 : <b>{rows.length}명</b> <span className="mx-1 text-muted-foreground">/</span> 멘티 매칭된 인원 : <b>{matched}명</b>
          </>
        }
      />
      <p className="text-xs text-muted-foreground">
        확인 여부 = 멘토가 플랫폼에 로그인해 배정된 멘티를 열람한 시각. [회수]는 회차 시작 전, [재배정]은 진행 중에도 가능(잔여 회차 승계). 멘토 이름을 누르면 정보 팝업이 열립니다.
        지급서류 = 셋트 상태(<b>-</b> 관리 안 함 / <b>X</b> 관리하지만 미수령 / <b>O</b> 이메일 등으로 수령), 누르면 변경 팝업.
      </p>
      {filtered.length === 0 && <p className="text-sm text-muted-foreground">해당하는 멘토가 없습니다.</p>}
      {filtered.map((m) => (
        <div key={m.mentorId} className="rounded-xl border bg-background p-4">
          <div className="flex flex-wrap items-center gap-2">
            <MentorName id={m.mentorId} name={m.mentorName} count={m.mentees.length} className="text-sm font-bold" caseHrefBase={caseHrefBase} />
            {m.organization && <span className="text-xs text-muted-foreground">{m.organization}</span>}
            <span className="text-xs text-muted-foreground">분야:</span>
            <Chips items={m.expertise} max={10} />
            {m.designatedGroupNames.length > 0 && <span className="text-[11px] text-violet-700">지정: {m.designatedGroupNames.join(', ')}</span>}
            <MentorReviewButton mentor={m} groups={groups} currentGroupId={currentGroupId} />
            {m.mentees.length === 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">지급서류 <PaymentDocSetButton mentorId={m.mentorId} mentorName={m.mentorName} state={m.paymentDocState} size="xs" /></span>
            )}
            {/* 멘토 연락처 — 담당 멘티 배지 왼쪽 (P27-06) */}
            <span className="ml-auto inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {m.phone && <span className="inline-flex items-center gap-1 whitespace-nowrap"><Phone className="h-3 w-3" />{m.phone}</span>}
              {m.email && <span className="inline-flex items-center gap-1 whitespace-nowrap"><Mail className="h-3 w-3" />{m.email}</span>}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.mentees.length > 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
              {m.mentees.length > 0 ? `담당 멘티 ${m.mentees.length}` : '미배정 (배정 대기)'}
            </span>
          </div>
          {m.mentees.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-1">순위</th>
                    <th className="px-2 py-1">멘티</th>
                    <th className="px-2 py-1">라운드</th>
                    <th className="px-2 py-1">방식</th>
                    <th className="px-2 py-1">매칭 일자</th>
                    <th className="px-2 py-1">확인 여부</th>
                    <th className="px-2 py-1">컨설팅 진행현황</th>
                    <th className="px-2 py-1 text-center" title="- 관리 안 함 / X 관리하지만 미수령 / O 수령">지급서류</th>
                    <th className="px-2 py-1">배정 관리</th>
                  </tr>
                </thead>
                <tbody>
                  {m.mentees.map((c, idx) => (
                    <tr key={c.caseId} className="border-b last:border-0">
                      <td className="px-2 py-1.5"><RankBadge rank={c.rank} /></td>
                      <td className="px-2 py-1.5">
                        <Link href={`${caseHrefBase}/${c.caseId}`} className="font-medium text-primary hover:underline">{c.label}</Link>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{c.groupName ?? '-'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{c.matchMethod ? MATCH_METHOD_LABELS[c.matchMethod] : '-'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{c.assignedAt ? formatDate(c.assignedAt) : '-'}</td>
                      <td className="px-2 py-1.5"><ConfirmMark at={c.confirmedAt} /></td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className="mr-1.5">{c.statusLabel}</span>
                        <RoundDots done={c.roundsDone} required={c.requiredRounds} />
                      </td>
                      {idx === 0 && (
                        <td className="px-2 py-1.5 text-center align-middle" rowSpan={m.mentees.length}>
                          <PaymentDocSetButton mentorId={m.mentorId} mentorName={m.mentorName} state={m.paymentDocState} />
                        </td>
                      )}
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" disabled={!c.canRecall || pending} title={c.canRecall ? '배정을 해제하고 등록 단계로' : '회차가 시작되어 회수할 수 없습니다 — 재배정 또는 케이스 상세의 강제 중도 종료를 사용'} onClick={() => recall(c.caseId, c.label)}>
                            <Undo2 className="h-3 w-3" /> 멘토 회수
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" disabled={!c.canReassign || pending} title={c.canReassign ? '다른 멘토로 즉시 교체(잔여 회차 승계)' : '이 단계에서는 재배정할 수 없습니다'} onClick={() => { setReassign({ caseId: c.caseId, menteeLabel: c.label, currentMentorId: m.mentorId, groupId: c.groupId, groupName: c.groupName ?? '-' }); setNewMentorId(undefined); }}>
                            <RefreshCw className="h-3 w-3" /> 멘토 재배정
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <Dialog open={!!reassign} onOpenChange={(o) => { if (!o) setReassign(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>멘토 재배정</DialogTitle>
            <DialogDescription>{reassign?.menteeLabel} 멘티({reassign?.groupName})를 다른 멘토로 교체합니다. 진행한 회차는 그대로 두고 잔여 회차를 새 멘토가 승계합니다. 괄호 안 숫자는 이 그룹에서 현재 담당 중인 멘티 수이며, 라운드별 정원(매칭 규칙)을 넘거나 다른 그룹에만 지정된 멘토는 선택할 수 없습니다.</DialogDescription>
          </DialogHeader>
          <Select value={newMentorId} onValueChange={setNewMentorId}>
            <SelectTrigger><SelectValue placeholder="새 멘토 선택" /></SelectTrigger>
            <SelectContent>
              {rows
                .filter((x) => x.mentorId !== reassign?.currentMentorId)
                .map((x) => {
                  const inGroup = reassign ? x.mentees.filter((c) => c.groupId === reassign.groupId && !c.withdrawn).length : x.mentees.length;
                  const eligible = !reassign || x.designatedGroupIds.length === 0 || x.designatedGroupIds.includes(reassign.groupId);
                  return (
                    <SelectItem key={x.mentorId} value={x.mentorId} disabled={!eligible}>
                      {mentorLabel(x.mentorName, inGroup)}
                      {!eligible ? ` · 다른 그룹 지정(${x.designatedGroupNames.join('/')})` : x.designatedGroupNames.length ? ` · 지정 ${x.designatedGroupNames.join('/')}` : ''}
                    </SelectItem>
                  );
                })}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassign(null)} disabled={pending}>취소</Button>
            <Button onClick={doReassign} disabled={pending || !newMentorId}>{pending ? '재배정 중…' : '재배정'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ──────────────────────────── 리포트: 멘토 진행현황 (P27-17) ──────────────────────────── */

/** 그룹별(담당 인원) / 담당 멘티명 / 회차 / 확정 실지급 / 만족도 / 운영사 평가 — 발주처·운영사 공용 열람 표 */
export function MentorProgressTable({ rows, caseHrefBase = '/nextlab/cases', showReview = true }: { rows: MentorMatchRow[]; caseHrefBase?: string; showReview?: boolean }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? rows.filter((m) => m.mentorName.includes(q)) : rows;
  }, [rows, query]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-300 bg-sky-100 px-4 py-2.5 text-sm dark:border-sky-800 dark:bg-sky-950/40">
        <span className="font-semibold text-sky-950 dark:text-sky-100">멘토 {rows.length}명 · 담당 멘티 {rows.reduce((a, m) => a + m.mentees.length, 0)}명</span>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="멘토 이름 검색" className="h-9 w-44 bg-background pl-8" />
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-3 py-2">멘토</th>
              <th className="px-3 py-2">그룹별 (담당 멘티 인원)</th>
              <th className="px-3 py-2">담당 멘티명</th>
              <th className="px-3 py-2 text-right">회차</th>
              <th className="px-3 py-2 text-right">확정 실지급</th>
              <th className="px-3 py-2 text-right">만족도</th>
              {showReview && <th className="px-3 py-2 text-right">운영사 평가</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={showReview ? 7 : 6} className="px-3 py-6 text-center text-muted-foreground">멘토가 없습니다.</td></tr>}
            {filtered.map((m) => {
              const byGroup = new Map<string, number>();
              for (const c of m.mentees) if (!c.withdrawn) byGroup.set(c.groupName ?? '-', (byGroup.get(c.groupName ?? '-') ?? 0) + 1);
              return (
                <tr key={m.mentorId} className="border-b align-top last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap"><MentorName id={m.mentorId} name={m.mentorName} count={m.mentees.filter((c) => !c.withdrawn).length} caseHrefBase={caseHrefBase} /></td>
                  <td className="px-3 py-2">
                    {byGroup.size === 0 ? <span className="text-muted-foreground">미배정 (배정 대기)</span> : (
                      <div className="flex flex-wrap gap-1">
                        {Array.from(byGroup.entries()).map(([g, n]) => <span key={g} className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">{g} ({n})</span>)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      {m.mentees.map((c) => (
                        <span key={c.caseId} className="inline-flex flex-wrap items-center gap-1.5">
                          <Link href={`${caseHrefBase}/${c.caseId}`} className={cn('text-primary hover:underline', c.withdrawn && 'line-through opacity-60')}>{c.label}</Link>
                          <RoundDots done={c.roundsDone} required={c.requiredRounds} />
                        </span>
                      ))}
                      {m.mentees.length === 0 && <span className="text-muted-foreground">-</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.roundsDone}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKRW(m.settledNet)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.surveyAvg ?? '-'}</td>
                  {showReview && <td className="px-3 py-2 text-right tabular-nums">{m.reviewAvg ?? '-'}{m.reviews.length ? <span className="ml-1 text-muted-foreground">({m.reviews.length})</span> : ''}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────── 멘티 매칭 리스트 ──────────────────────────── */

const PINK_BTN = 'h-6 rounded-md bg-brand-pink px-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-brand-pink/90';

export function MenteeMatchList({ rows, mentors, caseHrefBase = '/nextlab/cases', toolbarExtra }: { rows: MenteeMatchRow[]; mentors: MentorMatchRow[]; caseHrefBase?: string; toolbarExtra?: React.ReactNode }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState('');
  const [pairsFor, setPairsFor] = useState<MenteeMatchRow | null>(null);
  // 수동 검색 (P27-09)
  const [manualFor, setManualFor] = useState<MenteeMatchRow | null>(null);
  const [manualQuery, setManualQuery] = useState('');
  const [manualPick, setManualPick] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? rows.filter((r) => r.menteeName.includes(q) || r.label.includes(q) || (r.mentorName ?? '').includes(q)) : rows;
  }, [rows, query]);
  const assigned = rows.filter((r) => r.mentorId && !r.withdrawn).length;

  const confirm = (caseId: string, mentorId: string, mentorName: string, menteeName: string) => {
    if (!window.confirm(`${menteeName} 멘티를 '${mentorName}' 멘토에게 매칭 확정할까요?`)) return;
    start(async () => {
      const r = await confirmMatchAction(caseId, mentorId);
      toast(r.ok ? { title: `${mentorName} 멘토로 매칭을 확정했습니다.` } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });
  };
  const manualCandidates = useMemo(() => {
    if (!manualFor) return [];
    const q = manualQuery.trim();
    return mentors
      .map((m) => ({
        m,
        inGroup: m.mentees.filter((c) => c.groupId === manualFor.groupId && !c.withdrawn).length,
        eligible: m.designatedGroupIds.length === 0 || m.designatedGroupIds.includes(manualFor.groupId),
      }))
      .filter((x) => !q || x.m.mentorName.includes(q) || x.m.expertise.some((e) => e.includes(q)))
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.inGroup - b.inGroup || a.m.mentorName.localeCompare(b.m.mentorName, 'ko'));
  }, [mentors, manualFor, manualQuery]);
  const doManual = () => {
    if (!manualFor || !manualPick) return;
    const target = mentors.find((m) => m.mentorId === manualPick);
    start(async () => {
      const r = await manualMatchAction(manualFor.caseId, manualPick);
      toast(r.ok ? { title: `${target?.mentorName ?? ''} 멘토로 매칭(수동)했습니다.` } : { title: r.error, variant: 'destructive' });
      if (r.ok) {
        setManualFor(null);
        setManualPick(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        query={query}
        onQuery={setQuery}
        exportHref="/api/nextlab/roster-export?tab=mentee-match"
        extra={toolbarExtra}
        summary={
          <>
            전체 멘티 인원 : <b>{rows.length}명</b> <span className="mx-1 text-muted-foreground">/</span> 멘토 배정된 인원 : <b>{assigned}명</b>
          </>
        }
      />
      <p className="text-xs text-muted-foreground">
        희망 멘토(엑셀 &lsquo;재배치 희망여부&rsquo;)가 후보 자격(그룹 지정·라운드 정원)이면 등록 시 자동 확정됩니다. 아니면 희망분야 <b>1순위 → 2순위 → …</b> 순서로 후보 멘토 최대 3명이 추천되며(높은 순위 일치 우선) [매칭 확정]을 누르면 배정됩니다.
        추천 3명이 모두 맞지 않으면 [수동 검색]으로 멘토를 직접 골라 매칭하세요. 방식 = 자동(멘티 희망) / 추천 / 수동. 추천 옆 <b>(n)</b>은 그 멘토의 현재 확정 멘티 수입니다.
      </p>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2">순위</th>
              <th className="px-3 py-2">멘티 · 희망분야</th>
              <th className="px-3 py-2">라운드</th>
              <th className="px-3 py-2">배정 멘토 / 추천</th>
              <th className="px-3 py-2">방식</th>
              <th className="px-3 py-2">매칭 일자</th>
              <th className="px-3 py-2">확인(멘토)</th>
              <th className="px-3 py-2">만족도</th>
              <th className="px-3 py-2">진행</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">해당하는 멘티가 없습니다.</td></tr>
            )}
            {filtered.map((r) => {
              const unassigned = !r.mentorId;
              return (
                <tr key={r.caseId} className={`border-b align-top last:border-0 ${r.withdrawn ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2"><RankBadge rank={r.rank} /></td>
                  <td className="px-3 py-2">
                    <Link href={`${caseHrefBase}/${r.caseId}`} className="font-medium text-primary hover:underline">{r.label}</Link>
                    <div className="mt-1"><Chips items={r.needs} tone="amber" max={6} /></div>
                    {r.preferredMentor && <p className="mt-0.5 text-[11px] text-muted-foreground">희망 멘토: {r.preferredMentor}</p>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.groupName ?? '-'}</td>
                  {unassigned ? (
                    /* 미매칭: 배정 멘토/방식/매칭 일자/확인/만족도 5칸을 합쳐 추천 영역으로 사용 (P27-10) */
                    <td className="px-3 py-2" colSpan={5}>
                      {r.recommendations.length > 0 ? (
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-left text-muted-foreground">
                              <th className="py-0.5 pr-2 font-normal">추천</th>
                              <th className="py-0.5 pr-2 font-normal">멘토명 (이 그룹 매칭 인원)</th>
                              <th className="py-0.5 pr-2 font-normal">적합 점수</th>
                              <th className="py-0.5 pr-2 font-normal">추천 이유 · 분야</th>
                              <th className="py-0.5 font-normal" />
                            </tr>
                          </thead>
                          <tbody>
                            {r.recommendations.map((rec) => (
                              <tr key={rec.mentorId} className="border-t border-dashed">
                                <td className="py-1 pr-2 align-top"><span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">추천 {rec.rank}</span></td>
                                <td className="py-1 pr-2 align-top whitespace-nowrap"><MentorName id={rec.mentorId} name={rec.mentorName} count={rec.mentorActive} caseHrefBase={caseHrefBase} /></td>
                                <td className="py-1 pr-2 align-top whitespace-nowrap"><span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200">{Math.round(rec.score)}점</span></td>
                                <td className="py-1 pr-2 align-top">
                                  <div className="text-muted-foreground">{rec.rationale ?? ''}</div>
                                  <div className="mt-0.5"><Chips items={rec.expertise} max={10} /></div>
                                </td>
                                <td className="py-1 align-top text-right whitespace-nowrap">
                                  {r.canConfirm && (
                                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={pending} onClick={() => confirm(r.caseId, rec.mentorId, rec.mentorName, r.menteeName)}>
                                      매칭 확정
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-2 text-muted-foreground">
                          미배정 · 추천 없음
                          {r.canConfirm && (
                            <button
                              type="button"
                              disabled={pending}
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-foreground hover:bg-accent disabled:opacity-50"
                              title="희망분야·희망 멘토 기준으로 미배정 멘토 후보를 다시 찾습니다 (자동 배정 없음)"
                              onClick={() =>
                                start(async () => {
                                  const res = await rebuildRecommendationsAction(r.caseId);
                                  toast(res.ok ? { title: res.count > 0 ? `후보 ${res.count}명을 추천했습니다.` : '조건에 맞는 미배정 멘토가 없습니다. 수동 검색을 이용하세요.' } : { title: res.error, variant: 'destructive' });
                                  if (res.ok) router.refresh();
                                })
                              }
                            >
                              <RefreshCw className="h-3 w-3" /> 추천 다시 계산
                            </button>
                          )}
                        </span>
                      )}
                      {r.canConfirm && (
                        <div className="mt-1.5">
                          <Button size="sm" variant="secondary" className="h-6 gap-1 px-2 text-[11px]" disabled={pending} onClick={() => { setManualFor(r); setManualPick(null); setManualQuery(''); }} title="추천 3명이 모두 맞지 않을 때 — 멘토 리스트에서 직접 골라 매칭">
                            <UserSearch className="h-3 w-3" /> 수동 검색
                          </Button>
                        </div>
                      )}
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                          <MentorName id={r.mentorId} name={r.mentorName ?? '-'} count={r.mentorActive} caseHrefBase={caseHrefBase} />
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.matchMethod ? (
                          <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', r.matchMethod === 'auto_preferred' ? 'bg-brand-coral/15 text-brand-coral' : r.matchMethod === 'recommended' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-foreground')}>
                            {MATCH_METHOD_LABELS[r.matchMethod]}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.assignedAt ? formatDate(r.assignedAt) : '-'}</td>
                      <td className="px-3 py-2"><ConfirmMark at={r.confirmedAt} /></td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.surveyDone ? '작성 완료' : '-'}</td>
                    </>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1">
                      {/* 배정 멘토가 있으면 핫핑크 [배정] 버튼만 (P27-05). 배정 이후 단계면 단계명을 함께 표시 */}
                      {r.mentorId ? (
                        <>
                          {r.status !== 'mentor_assigned' && <span className={cn(r.withdrawn && 'text-destructive')}>{r.statusLabel}</span>}
                          <button type="button" className={PINK_BTN} onClick={() => setPairsFor(r)} title="배정 근거 — 희망분야 ↔ 멘토 분야 연결 · 매칭 방식">배정</button>
                        </>
                      ) : (
                        <span>{r.statusLabel}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 배정 근거 팝업 (P27-12: 재배치 희망 자동 매칭이면 코랄 배지) */}
      <Dialog open={!!pairsFor} onOpenChange={(o) => { if (!o) setPairsFor(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>배정 근거 — 희망분야 ↔ 멘토 분야</DialogTitle>
            <DialogDescription>
              {pairsFor?.label} ↔ {pairsFor?.mentorName ? mentorLabel(pairsFor.mentorName, pairsFor.mentorActive) : '-'}
              {pairsFor?.matchMethod ? ` · 방식: ${MATCH_METHOD_LABELS[pairsFor.matchMethod]}` : ''}
            </DialogDescription>
          </DialogHeader>
          {pairsFor && (
            <div className="flex flex-col gap-3 text-sm">
              {pairsFor.matchMethod === 'auto_preferred' && (
                <div className="flex flex-col items-center gap-1 rounded-xl bg-brand-coral px-4 py-3 text-center text-white shadow">
                  <span className="text-lg font-extrabold tracking-tight">재배정 희망 자동 매칭</span>
                  <span className="text-xs opacity-90">멘티가 희망 멘토로 &lsquo;{pairsFor.preferredMentor ?? pairsFor.mentorName}&rsquo;을(를) 지정해 등록 시 자동 확정되었습니다.</span>
                </div>
              )}
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1">순위</th><th className="py-1">멘티 희망분야</th><th className="py-1">멘토 분야(일치)</th>
                  </tr>
                </thead>
                <tbody>
                  {matchedPairs(pairsFor.needs, pairsFor.mentorExpertise).map((p) => (
                    <tr key={p.rank} className="border-b last:border-0">
                      <td className="py-1">{p.rank}순위</td>
                      <td className="py-1">{p.need}</td>
                      <td className={`py-1 ${p.matched ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}`}>{p.matched ?? '일치 없음'}</td>
                    </tr>
                  ))}
                  {pairsFor.needs.length === 0 && <tr><td colSpan={3} className="py-2 text-muted-foreground">희망분야가 등록되지 않았습니다.</td></tr>}
                </tbody>
              </table>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">멘토 분야 전체</p>
                <Chips items={pairsFor.mentorExpertise} max={10} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 수동 검색 팝업 (P27-09) */}
      <Dialog open={!!manualFor} onOpenChange={(o) => { if (!o) setManualFor(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>수동 검색 — {manualFor?.label} 멘티에게 멘토 매칭</DialogTitle>
            <DialogDescription>
              {manualFor?.groupName ?? '-'} 라운드 · 멘토 한 명을 선택해 [매칭(배정) 하기]. 이 그룹의 매칭 인원이 적은 멘토가 위로 옵니다. 그룹 지정이 다른 멘토와 정원 초과는 서버에서 거부됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={manualQuery} onChange={(e) => setManualQuery(e.target.value)} placeholder="멘토명 · 분야 검색" className="h-9 pl-8" autoFocus />
          </div>
          {manualFor && (
            <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-muted-foreground">멘티 희망분야:</span>
              <Chips items={manualFor.needs} tone="amber" max={6} />
            </div>
          )}
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60">
                <tr className="text-left text-muted-foreground">
                  <th className="w-8 px-2 py-1.5" />
                  <th className="px-2 py-1.5">멘토명</th>
                  <th className="px-2 py-1.5 text-right whitespace-nowrap">이 그룹 매칭 멘티</th>
                  <th className="px-2 py-1.5">분야</th>
                </tr>
              </thead>
              <tbody>
                {manualCandidates.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">해당하는 멘토가 없습니다.</td></tr>}
                {manualCandidates.map(({ m, inGroup, eligible }) => (
                  <tr key={m.mentorId} className={cn('cursor-pointer border-t hover:bg-accent/40', manualPick === m.mentorId && 'bg-brand-pink/10', !eligible && 'opacity-50')} onClick={() => eligible && setManualPick(m.mentorId)}>
                    <td className="px-2 py-1.5 text-center"><input type="radio" name="manual-mentor" checked={manualPick === m.mentorId} disabled={!eligible} onChange={() => setManualPick(m.mentorId)} aria-label={m.mentorName} /></td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="font-medium">{m.mentorName}</span>
                      {m.organization && <span className="ml-1 text-muted-foreground">{m.organization}</span>}
                      {!eligible && <span className="ml-1 text-[10px] text-violet-700">그룹 지정 외 ({m.designatedGroupNames.join('/')})</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{inGroup}</td>
                    <td className="px-2 py-1.5"><Chips items={m.expertise} max={10} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualFor(null)} disabled={pending}>취소</Button>
            <Button className="bg-brand-pink text-white hover:bg-brand-pink/90" onClick={doManual} disabled={pending || !manualPick}>
              <FileCheck2 className="mr-1 h-4 w-4" />{pending ? '매칭 중…' : '매칭(배정) 하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
