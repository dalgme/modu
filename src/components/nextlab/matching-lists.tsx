'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Circle, FileCheck2, Link2, Mail, MessageSquare, Phone, RefreshCw, Search, Undo2, UserCheck, UserSearch, Users } from 'lucide-react';

import { ListToolbar } from '@/components/common/list-toolbar';
import { ContactLinks } from '@/components/common/contact-links';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog, useConfirm } from '@/components/common/confirm-dialog';
import { StatusBadge } from '@/components/cases/status-badge';
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

/**
 * URL 검색 파라미터와 동기화되는 상태 (`?q=` `?filter=`) — 대시보드 카드 링크로 필터된 목록에 바로 들어올 수 있게 (P30).
 * (P31) 로컬 상태는 즉시 갱신해 목록을 바로 필터하고, URL 은 300ms 디바운스 후 `window.history.replaceState` 로만 바꾼다
 * (키 입력마다 router.replace 하면 서버 왕복·리렌더로 폰에서 입력이 끊긴다). 다른 파라미터(tab 등)는 보존한다.
 * Next 14 는 history.replaceState 를 라우터와 동기화하므로 useSearchParams 도 함께 갱신된다.
 */
function useUrlParam(key: string, fallback = ''): [string, (v: string) => void] {
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get(key) ?? fallback;
  const [value, setValue] = useState(fromUrl);
  /** 마지막으로 우리가 URL 에 밀어 넣은 값 — 이 값으로 되돌아오는 URL 변경은 로컬 입력을 덮어쓰지 않는다 */
  const pushed = useRef(fromUrl);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (fromUrl !== pushed.current) {
      pushed.current = fromUrl;
      setValue(fromUrl);
    }
  }, [fromUrl]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const update = useCallback(
    (v: string) => {
      setValue(v);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const next = new URLSearchParams(window.location.search);
        if (v && v !== fallback) next.set(key, v);
        else next.delete(key);
        const qs = next.toString();
        pushed.current = v && v !== fallback ? v : fallback;
        window.history.replaceState(window.history.state, '', qs ? `${pathname}?${qs}` : pathname);
      }, 300);
    },
    [key, fallback, pathname],
  );
  return [value, update];
}

/**
 * (P31) 멘토 선택 리스트 — 수동 검색·재배정 팝업 공용. 이름/분야 검색 + 라디오 선택, 이 그룹 매칭 인원이 적은 멘토가 위.
 * 그룹 지정이 다른 멘토는 비활성(서버 게이트와 같은 기준). autoFocus 는 두지 않는다(폰에서 키보드가 시트를 밀어 올림).
 */
function MentorPickList({ mentors, groupId, excludeMentorId, pick, onPick, query, onQuery }: { mentors: MentorMatchRow[]; groupId: string; excludeMentorId?: string | null; pick: string | null; onPick: (id: string) => void; query: string; onQuery: (q: string) => void }) {
  const candidates = useMemo(() => {
    const q = query.trim();
    return mentors
      .filter((m) => m.mentorId !== excludeMentorId)
      .map((m) => ({
        m,
        inGroup: m.mentees.filter((c) => c.groupId === groupId && !c.withdrawn).length,
        eligible: m.designatedGroupIds.length === 0 || m.designatedGroupIds.includes(groupId),
      }))
      .filter((x) => !q || x.m.mentorName.includes(q) || (x.m.organization ?? '').includes(q) || x.m.expertise.some((e) => e.includes(q)))
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.inGroup - b.inGroup || a.m.mentorName.localeCompare(b.m.mentorName, 'ko'));
  }, [mentors, groupId, excludeMentorId, query]);
  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="멘토명 · 소속 · 분야 검색" className="h-10 pl-8 sm:h-9" />
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60">
            <tr className="text-left text-muted-foreground">
              <th className="w-8 px-2 py-1.5" />
              <th className="px-2 py-1.5">멘토명</th>
              <th className="px-2 py-1.5 text-right whitespace-nowrap">이 그룹 매칭</th>
              <th className="hidden px-2 py-1.5 md:table-cell">분야</th>
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">해당하는 멘토가 없습니다.</td></tr>}
            {candidates.map(({ m, inGroup, eligible }) => (
              <tr key={m.mentorId} className={cn('cursor-pointer border-t hover:bg-accent/40', pick === m.mentorId && 'bg-brand-pink/10', !eligible && 'opacity-50')} onClick={() => eligible && onPick(m.mentorId)}>
                <td className="px-2 py-2 text-center"><input type="radio" name="mentor-pick" className="h-5 w-5 accent-primary sm:h-4 sm:w-4" checked={pick === m.mentorId} disabled={!eligible} onChange={() => onPick(m.mentorId)} aria-label={m.mentorName} /></td>
                <td className="px-2 py-2">
                  <span className="font-medium">{m.mentorName}</span>
                  {m.organization && <span className="ml-1 text-muted-foreground">{m.organization}</span>}
                  {!eligible ? <span className="ml-1 text-[10px] text-violet-700">그룹 지정 외 ({m.designatedGroupNames.join('/')})</span> : m.designatedGroupNames.length > 0 && <span className="ml-1 text-[10px] text-violet-700">지정 {m.designatedGroupNames.join('/')}</span>}
                  <div className="mt-0.5 md:hidden"><Chips items={m.expertise} max={4} /></div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{inGroup}</td>
                <td className="hidden px-2 py-2 md:table-cell"><Chips items={m.expertise} max={10} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** (P31) 팝업 하단 고정 버튼 영역 — 본문이 길어도 확인 버튼이 항상 보인다 */
const STICKY_FOOTER = 'sticky bottom-0 z-10 -mb-4 gap-2 border-t bg-background pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:-mb-6 sm:pb-6';

/** 현재 목록 URL 을 `?from=` 으로 붙여 케이스 상세의 "← 목록으로"가 이 화면(탭·필터 포함)으로 돌아오게 한다 (P30) */
function useCaseHref(caseHrefBase: string): (caseId: string) => string {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString();
  const from = encodeURIComponent(qs ? `${pathname}?${qs}` : pathname);
  return (caseId: string) => `${caseHrefBase}/${caseId}?from=${from}`;
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
        className={cn('inline-flex items-center justify-center rounded-md border font-bold', size === 'xs' ? 'h-8 min-w-[2.25rem] px-1.5 text-[11px] sm:h-6 sm:min-w-[2rem]' : 'h-9 min-w-[2.75rem] px-2 text-xs sm:h-7 sm:min-w-[2.5rem]', cls, readOnly && 'cursor-default')}
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
      <Button size="sm" variant="outline" className="h-9 gap-1 px-2 text-[11px] sm:h-7" onClick={() => setOpen(true)} title="그룹별 운영사 평가·메모 (멘토 본인 비공개, 멘토 정보에 누적)">
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
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-base sm:h-9 sm:text-sm">
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">평점</span>
                <select value={rating} onChange={(e) => setRating(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-base sm:h-9 sm:text-sm">
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
  const [query, setQuery] = useUrlParam('q');
  const caseHref = useCaseHref(caseHrefBase);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [reassign, setReassign] = useState<{ caseId: string; menteeLabel: string; currentMentorId: string; currentMentorName: string; groupId: string; groupName: string } | null>(null);
  const [newMentorId, setNewMentorId] = useState<string | undefined>();
  const [reassignQuery, setReassignQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? rows.filter((m) => m.mentorName.includes(q) || (m.organization ?? '').includes(q)) : rows;
  }, [rows, query]);
  const matched = rows.filter((m) => m.mentees.length > 0).length;

  const recall = async (caseId: string, label: string, mentorName: string) => {
    const ok = await confirm({
      title: '멘토 배정 회수',
      description: `${label} 멘티의 멘토(${mentorName}) 배정을 회수하고 등록 단계로 되돌립니다.`,
      impact: ['멘티는 다시 "멘토 배정 대기"가 됩니다.', '회수 이력은 배정 기록과 감사로그에 남습니다.', '회차가 이미 시작된 케이스는 서버에서 거부됩니다.'],
      confirmLabel: '회수',
      severity: 'danger',
    });
    if (!ok) return;
    start(async () => {
      const r = await recallMentorAction(caseId);
      toast(r.ok ? { title: '배정을 회수했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });
  };
  const doReassign = async () => {
    if (!reassign || !newMentorId) return;
    const target = rows.find((x) => x.mentorId === newMentorId);
    const ok = await confirm({
      title: '멘토 재배정',
      description: `${reassign.menteeLabel} 멘티의 멘토를 ${reassign.currentMentorName} → ${target?.mentorName ?? ''} 으로 교체합니다.`,
      impact: ['진행한 회차는 그대로 두고 잔여 회차를 새 멘토가 승계합니다.', '기존 멘토의 이행 회차는 케이스 종결 시 부분 정산됩니다.', '정원·그룹 지정 조건은 서버에서 다시 검증합니다.'],
      confirmLabel: '재배정',
    });
    if (!ok) return;
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
        placeholder="멘토명 · 소속 검색"
        exportHref="/api/nextlab/roster-export?tab=mentor-match"
        exportLabel="엑셀 다운로드"
        summary={
          <>
            전체 멘토 인원 : <b>{rows.length}명</b> <span className="mx-1 text-muted-foreground">/</span> 멘티 매칭된 인원 : <b>{matched}명</b>
          </>
        }
      />
      {confirmDialog}
      <p className="text-xs text-muted-foreground">
        확인 여부 = 멘토가 플랫폼에 로그인해 배정된 멘티를 열람한 시각. [회수]는 회차 시작 전, [재배정]은 진행 중에도 가능(잔여 회차 승계). 멘토 이름을 누르면 정보 팝업이 열립니다.
        지급서류 = 셋트 상태(<b>-</b> 관리 안 함 / <b>X</b> 관리하지만 미수령 / <b>O</b> 이메일 등으로 수령), 누르면 변경 팝업.
      </p>
      {filtered.length === 0 && (
        rows.length === 0
          ? <EmptyState icon={Users} title="등록된 멘토가 없습니다" hint="회원 명단 › 회원 등록에서 멘토를 등록하면 여기에 나타납니다." action={<Link href="/nextlab/roster?tab=register&reg=mentor" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">멘토 등록</Link>} />
          : <EmptyState compact icon={Search} title="검색 결과가 없습니다" hint="검색어를 지우거나 다른 이름으로 찾아보세요." action={<button type="button" className="text-xs font-semibold text-primary underline" onClick={() => setQuery('')}>검색 초기화</button>} />
      )}
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
              {m.phone && <span className="inline-flex items-center gap-1 whitespace-nowrap"><Phone className="h-3 w-3" />{m.phone} <ContactLinks phone={m.phone} name={m.mentorName} size="xs" /></span>}
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
                    <th className="hidden px-2 py-1 md:table-cell">방식</th>
                    <th className="hidden px-2 py-1 md:table-cell">매칭 일자</th>
                    <th className="hidden px-2 py-1 md:table-cell">확인 여부</th>
                    <th className="px-2 py-1">컨설팅 진행현황</th>
                    <th className="px-2 py-1 text-center" title="- 관리 안 함 / X 관리하지만 미수령 / O 수령">지급서류</th>
                    <th className="hidden px-2 py-1 md:table-cell">배정 관리</th>
                  </tr>
                </thead>
                <tbody>
                  {m.mentees.map((c, idx) => (
                    <tr key={c.caseId} className="border-b last:border-0">
                      <td className="px-2 py-1.5"><RankBadge rank={c.rank} /></td>
                      <td className="px-2 py-1.5">
                        <Link href={caseHref(c.caseId)} className="font-medium text-primary hover:underline">{c.label}</Link>
                        {/* (P31) 폰: 배정 관리 버튼을 멘티 셀 아래로 (표 가로폭 절약) */}
                        <div className="mt-1.5 flex gap-1 md:hidden">
                          <Button size="sm" variant="outline" className="h-9 gap-1 px-2 text-[11px]" disabled={!c.canRecall || pending} onClick={() => void recall(c.caseId, c.label, m.mentorName)}>
                            <Undo2 className="h-3 w-3" /> 회수
                          </Button>
                          <Button size="sm" variant="outline" className="h-9 gap-1 px-2 text-[11px]" disabled={!c.canReassign || pending} onClick={() => { setReassign({ caseId: c.caseId, menteeLabel: c.label, currentMentorId: m.mentorId, currentMentorName: m.mentorName, groupId: c.groupId, groupName: c.groupName ?? '-' }); setNewMentorId(undefined); setReassignQuery(''); }}>
                            <RefreshCw className="h-3 w-3" /> 재배정
                          </Button>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{c.groupName ?? '-'}</td>
                      <td className="hidden px-2 py-1.5 whitespace-nowrap md:table-cell">{c.matchMethod ? MATCH_METHOD_LABELS[c.matchMethod] : '-'}</td>
                      <td className="hidden px-2 py-1.5 whitespace-nowrap md:table-cell">{c.assignedAt ? formatDate(c.assignedAt) : '-'}</td>
                      <td className="hidden px-2 py-1.5 md:table-cell"><ConfirmMark at={c.confirmedAt} /></td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <StatusBadge status={c.status} short className="mr-1.5" />
                        <RoundDots done={c.roundsDone} required={c.requiredRounds} />
                      </td>
                      {idx === 0 && (
                        <td className="px-2 py-1.5 text-center align-middle" rowSpan={m.mentees.length}>
                          <PaymentDocSetButton mentorId={m.mentorId} mentorName={m.mentorName} state={m.paymentDocState} />
                        </td>
                      )}
                      <td className="hidden px-2 py-1.5 whitespace-nowrap md:table-cell">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-9 gap-1 px-2 text-[11px] md:h-7" disabled={!c.canRecall || pending} title={c.canRecall ? '배정을 해제하고 등록 단계로' : '회차가 시작되어 회수할 수 없습니다 — 재배정 또는 케이스 상세의 강제 중도 종료를 사용'} onClick={() => void recall(c.caseId, c.label, m.mentorName)}>
                            <Undo2 className="h-3 w-3" /> 멘토 회수
                          </Button>
                          <Button size="sm" variant="outline" className="h-9 gap-1 px-2 text-[11px] md:h-7" disabled={!c.canReassign || pending} title={c.canReassign ? '다른 멘토로 즉시 교체(잔여 회차 승계)' : '이 단계에서는 재배정할 수 없습니다'} onClick={() => { setReassign({ caseId: c.caseId, menteeLabel: c.label, currentMentorId: m.mentorId, currentMentorName: m.mentorName, groupId: c.groupId, groupName: c.groupName ?? '-' }); setNewMentorId(undefined); setReassignQuery(''); }}>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>멘토 재배정</DialogTitle>
            <DialogDescription>{reassign?.menteeLabel} 멘티({reassign?.groupName})를 다른 멘토로 교체합니다. 진행한 회차는 그대로 두고 잔여 회차를 새 멘토가 승계합니다. 괄호 안 숫자는 이 그룹에서 현재 담당 중인 멘티 수이며, 라운드별 정원(매칭 규칙)을 넘거나 다른 그룹에만 지정된 멘토는 선택할 수 없습니다.</DialogDescription>
          </DialogHeader>
          {/* (P31) Radix Select 대신 수동 검색과 같은 검색형 리스트 — 폰에서 긴 드롭다운 대신 검색·탭 */}
          {reassign && (
            <MentorPickList mentors={rows} groupId={reassign.groupId} excludeMentorId={reassign.currentMentorId} pick={newMentorId ?? null} onPick={setNewMentorId} query={reassignQuery} onQuery={setReassignQuery} />
          )}
          <DialogFooter className={STICKY_FOOTER}>
            <Button className="h-10 sm:h-9" variant="outline" onClick={() => setReassign(null)} disabled={pending}>취소</Button>
            <Button className="h-10 sm:h-9" onClick={() => void doReassign()} disabled={pending || !newMentorId}>{pending ? '재배정 중…' : '재배정'}</Button>
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
        <div className="relative w-full sm:ml-auto sm:w-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="멘토 이름 검색" className="h-10 w-full bg-background pl-8 sm:h-9 sm:w-44" />
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
  const [query, setQuery] = useUrlParam('q');
  const [filter, setFilter] = useUrlParam('filter', 'all');
  const caseHref = useCaseHref(caseHrefBase);
  const { confirm: ask, dialog: confirmDialog } = useConfirm();
  const [pairsFor, setPairsFor] = useState<MenteeMatchRow | null>(null);
  // 수동 검색 (P27-09)
  const [manualFor, setManualFor] = useState<MenteeMatchRow | null>(null);
  const [manualQuery, setManualQuery] = useState('');
  const [manualPick, setManualPick] = useState<string | null>(null);
  // 일괄 확정 (P30) — 체크한 미배정 멘티를 추천 1순위 멘토로 순차 확정
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const FILTERS = useMemo(
    () => [
      { key: 'all', label: '전체', count: rows.length },
      { key: 'unassigned', label: '미배정만', count: rows.filter((r) => !r.mentorId && !r.withdrawn).length },
      { key: 'recommended', label: '추천 있음', count: rows.filter((r) => !r.mentorId && r.recommendations.length > 0).length },
      { key: 'unconfirmed', label: '멘토 미확인', count: rows.filter((r) => !!r.mentorId && !r.confirmedAt && !r.withdrawn).length },
    ],
    [rows],
  );
  const filtered = useMemo(() => {
    const q = query.trim();
    return rows.filter((r) => {
      if (filter === 'unassigned' && (r.mentorId || r.withdrawn)) return false;
      if (filter === 'recommended' && (r.mentorId || r.recommendations.length === 0)) return false;
      if (filter === 'unconfirmed' && (!r.mentorId || r.confirmedAt || r.withdrawn)) return false;
      if (!q) return true;
      return r.menteeName.includes(q) || r.label.includes(q) || (r.mentorName ?? '').includes(q);
    });
  }, [rows, query, filter]);
  const assigned = rows.filter((r) => r.mentorId && !r.withdrawn).length;
  /** 일괄 확정 가능한 행 = 확정 가능 + 추천 1순위 존재 */
  const bulkable = useMemo(() => filtered.filter((r) => r.canConfirm && !r.mentorId && r.recommendations.length > 0), [filtered]);
  const bulkTargets = bulkable.filter((r) => checked.has(r.caseId));

  const confirm = async (caseId: string, mentorId: string, mentorName: string, menteeName: string) => {
    const ok = await ask({
      title: '매칭 확정',
      description: `${menteeName} 멘티를 '${mentorName}' 멘토에게 매칭 확정합니다.`,
      impact: ['확정되면 멘토에게 담당 멘티로 표시되고, 그 멘토가 든 다른 멘티의 추천은 다시 계산됩니다.', '정원·그룹 지정은 서버에서 다시 검증합니다.'],
      confirmLabel: '매칭 확정',
    });
    if (!ok) return;
    start(async () => {
      const r = await confirmMatchAction(caseId, mentorId);
      toast(r.ok ? { title: `${mentorName} 멘토로 매칭을 확정했습니다.` } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });
  };

  const runBulk = () => {
    const targets = bulkTargets;
    if (targets.length === 0) return;
    setBulkProgress({ done: 0, total: targets.length });
    start(async () => {
      let okCount = 0;
      const failures: string[] = [];
      for (let i = 0; i < targets.length; i += 1) {
        const r0 = targets[i]!;
        const rec = r0.recommendations[0]!;
        try {
          const r = await confirmMatchAction(r0.caseId, rec.mentorId);
          if (r.ok) okCount += 1;
          else failures.push(`${r0.menteeName}: ${r.error}`);
        } catch (err) {
          failures.push(`${r0.menteeName}: ${err instanceof Error ? err.message : String(err)}`);
        }
        // (P31) 건별 토스트 대신 팝업 안 진행 막대만 갱신
        setBulkProgress({ done: i + 1, total: targets.length });
      }
      setBulkProgress(null);
      setBulkOpen(false);
      setChecked(new Set());
      toast(
        failures.length
          ? { title: `확정 ${okCount}건 · 실패 ${failures.length}건`, description: failures.slice(0, 3).join(' / ') + (failures.length > 3 ? ` 외 ${failures.length - 3}건` : ''), variant: 'destructive' }
          : { title: `추천 1순위로 ${okCount}건을 확정했습니다.` },
      );
      router.refresh();
    });
  };
  const doManual = async () => {
    if (!manualFor || !manualPick) return;
    const target = mentors.find((m) => m.mentorId === manualPick);
    const ok = await ask({
      title: '수동 매칭',
      description: `${manualFor.label} 멘티를 '${target?.mentorName ?? ''}' 멘토에게 수동으로 매칭합니다.`,
      impact: ['방식은 "수동"으로 기록됩니다.', '정원·그룹 지정 조건은 서버에서 다시 검증합니다.'],
      confirmLabel: '매칭(배정) 하기',
    });
    if (!ok) return;
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
        placeholder="멘티명 · 멘토명 검색"
        filters={FILTERS}
        active={filter}
        onFilter={(k) => { setFilter(k); setChecked(new Set()); }}
        exportHref="/api/nextlab/roster-export?tab=mentee-match"
        exportLabel="엑셀 다운로드"
        extra={
          <>
            {toolbarExtra}
            {bulkable.length > 0 && (
              <Button size="sm" variant="outline" className="h-9 gap-1 border-brand-pink text-brand-pink hover:bg-brand-pink/10" disabled={pending || bulkTargets.length === 0} onClick={() => setBulkOpen(true)} title="체크한 멘티를 각자의 추천 1순위 멘토로 순차 확정 (서버가 정원·지정을 다시 검증)">
                <Link2 className="h-4 w-4" /> 추천 1순위로 일괄 확정{bulkTargets.length ? ` (${bulkTargets.length})` : ''}
              </Button>
            )}
          </>
        }
        summary={
          <>
            전체 멘티 인원 : <b>{rows.length}명</b> <span className="mx-1 text-muted-foreground">/</span> 멘토 배정된 인원 : <b>{assigned}명</b>
          </>
        }
      />
      {confirmDialog}
      <p className="text-xs text-muted-foreground">
        희망 멘토(엑셀 &lsquo;재배치 희망여부&rsquo;)가 후보 자격(그룹 지정·라운드 정원)이면 등록 시 자동 확정됩니다. 아니면 희망분야 <b>1순위 → 2순위 → …</b> 순서로 후보 멘토 최대 3명이 추천되며(높은 순위 일치 우선) [매칭 확정]을 누르면 배정됩니다.
        추천 3명이 모두 맞지 않으면 [수동 검색]으로 멘토를 직접 골라 매칭하세요. 방식 = 자동(멘티 희망) / 추천 / 수동. 추천 옆 <b>(n)</b>은 그 멘토의 현재 확정 멘티 수입니다.
      </p>
      {/* (P31) 폰: 카드 리스트 — 멘티명·희망분야·추천 3개(세로)·전체폭 [매칭 확정]·[수동 검색]. 표는 md 이상에서만 */}
      <ul className="flex flex-col gap-2 md:hidden">
        {filtered.length === 0 && (
          <li className="rounded-xl border bg-background p-3">
            {rows.length === 0 ? (
              <EmptyState icon={Users} title="등록된 멘티가 없습니다" hint="회원 명단 › 회원 등록에서 멘티를 등록하거나 엑셀로 일괄 등록하세요." action={<Link href="/nextlab/roster?tab=register&reg=mentee" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">멘티 등록</Link>} />
            ) : (
              <EmptyState compact icon={Search} title="조건에 맞는 멘티가 없습니다" hint="필터를 [전체]로 바꾸거나 검색어를 지워 보세요." action={<button type="button" className="text-xs font-semibold text-primary underline" onClick={() => { setQuery(''); setFilter('all'); }}>필터·검색 초기화</button>} />
            )}
          </li>
        )}
        {bulkable.length > 0 && filtered.length > 0 && (
          <li className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <input type="checkbox" className="h-5 w-5 accent-primary" aria-label="추천 있는 미배정 멘티 전체 선택" checked={bulkable.every((r) => checked.has(r.caseId))} onChange={(e) => setChecked(e.target.checked ? new Set(bulkable.map((r) => r.caseId)) : new Set())} />
            추천 있는 미배정 멘티 전체 선택 ({bulkable.length})
          </li>
        )}
        {filtered.map((r) => {
          const unassigned = !r.mentorId;
          const canBulk = r.canConfirm && unassigned && r.recommendations.length > 0;
          const menteePhone = (r as { menteePhone?: string | null }).menteePhone ?? null;
          return (
            <li key={r.caseId} className={cn('rounded-xl border bg-background p-3', r.withdrawn && 'opacity-60')}>
              <div className="flex items-start gap-2">
                {canBulk ? (
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-primary" aria-label={`${r.menteeName} 일괄 확정 대상 선택`} checked={checked.has(r.caseId)} onChange={(e) => setChecked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(r.caseId); else n.delete(r.caseId); return n; })} />
                ) : <span className="w-5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <RankBadge rank={r.rank} />
                    <Link href={caseHref(r.caseId)} className="text-sm font-semibold text-primary hover:underline">{r.label}</Link>
                    <span className="text-[11px] text-muted-foreground">{r.groupName ?? '-'}</span>
                    <StatusBadge status={r.status} short />
                    {menteePhone && <ContactLinks phone={menteePhone} name={r.menteeName} size="xs" />}
                  </div>
                  <div className="mt-1"><Chips items={r.needs} tone="amber" max={6} /></div>
                  {r.preferredMentor && <p className="mt-0.5 text-[11px] text-muted-foreground">희망 멘토: {r.preferredMentor}</p>}
                </div>
              </div>
              {unassigned ? (
                <div className="mt-2 flex flex-col gap-2">
                  {r.recommendations.length > 0 ? (
                    r.recommendations.map((rec) => (
                      <div key={rec.mentorId} className="rounded-lg border border-dashed p-2 text-[11px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">추천 {rec.rank}</span>
                          <MentorName id={rec.mentorId} name={rec.mentorName} count={rec.mentorActive} caseHrefBase={caseHrefBase} className="text-xs" />
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200">{Math.round(rec.score)}점</span>
                        </div>
                        {rec.rationale && <p className="mt-1 text-muted-foreground">{rec.rationale}</p>}
                        <div className="mt-1"><Chips items={rec.expertise} max={6} /></div>
                        {r.canConfirm && (
                          <Button size="sm" variant="outline" className="mt-2 h-10 w-full text-xs" disabled={pending} onClick={() => void confirm(r.caseId, rec.mentorId, rec.mentorName, r.menteeName)}>
                            매칭 확정
                          </Button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      미배정 · 추천 없음
                      {r.canConfirm && (
                        <button type="button" disabled={pending} className="inline-flex h-9 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold text-foreground hover:bg-accent disabled:opacity-50" onClick={() => start(async () => { const res = await rebuildRecommendationsAction(r.caseId); toast(res.ok ? { title: res.count > 0 ? `후보 ${res.count}명을 추천했습니다.` : '조건에 맞는 미배정 멘토가 없습니다. 수동 검색을 이용하세요.' } : { title: res.error, variant: 'destructive' }); if (res.ok) router.refresh(); })}>
                          <RefreshCw className="h-3 w-3" /> 추천 다시 계산
                        </button>
                      )}
                    </div>
                  )}
                  {r.canConfirm && (
                    <Button size="sm" variant="secondary" className="h-10 w-full gap-1 text-xs" disabled={pending} onClick={() => { setManualFor(r); setManualPick(null); setManualQuery(''); }}>
                      <UserSearch className="h-3.5 w-3.5" /> 수동 검색
                    </Button>
                  )}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  <span className="inline-flex items-center gap-1">
                    <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <MentorName id={r.mentorId} name={r.mentorName ?? '-'} count={r.mentorActive} caseHrefBase={caseHrefBase} className="text-xs" />
                  </span>
                  {r.matchMethod && (
                    <span className={cn('rounded px-1.5 py-0.5 font-semibold', r.matchMethod === 'auto_preferred' ? 'bg-brand-coral/15 text-brand-coral' : r.matchMethod === 'recommended' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-foreground')}>{MATCH_METHOD_LABELS[r.matchMethod]}</span>
                  )}
                  {r.assignedAt && <span className="text-muted-foreground">{formatDate(r.assignedAt)}</span>}
                  <ConfirmMark at={r.confirmedAt} />
                  {r.surveyDone && <span className="text-muted-foreground">만족도 완료</span>}
                  <button type="button" className={cn(PINK_BTN, 'ml-auto h-9')} onClick={() => setPairsFor(r)}>배정</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border bg-background md:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="w-8 px-2 py-2">
                {bulkable.length > 0 && (
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-primary sm:h-4 sm:w-4"
                    aria-label="추천 있는 미배정 멘티 전체 선택"
                    checked={bulkable.every((r) => checked.has(r.caseId))}
                    onChange={(e) => setChecked(e.target.checked ? new Set(bulkable.map((r) => r.caseId)) : new Set())}
                  />
                )}
              </th>
              <th className="px-3 py-2">순위</th>
              <th className="px-3 py-2">멘티 · 희망분야</th>
              <th className="px-3 py-2">라운드</th>
              <th className="px-3 py-2">배정 멘토 / 추천</th>
              <th className="hidden px-3 py-2 md:table-cell">방식</th>
              <th className="hidden px-3 py-2 md:table-cell">매칭 일자</th>
              <th className="hidden px-3 py-2 md:table-cell">확인(멘토)</th>
              <th className="hidden px-3 py-2 md:table-cell">만족도</th>
              <th className="px-3 py-2">진행</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-4">
                  {rows.length === 0 ? (
                    <EmptyState icon={Users} title="등록된 멘티가 없습니다" hint="회원 명단 › 회원 등록에서 멘티를 등록하거나 엑셀로 일괄 등록하세요." action={<Link href="/nextlab/roster?tab=register&reg=mentee" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">멘티 등록</Link>} />
                  ) : (
                    <EmptyState compact icon={Search} title="조건에 맞는 멘티가 없습니다" hint={filter !== 'all' ? '필터를 [전체]로 바꾸거나 검색어를 지워 보세요.' : '검색어를 지우거나 다른 이름으로 찾아보세요.'} action={<button type="button" className="text-xs font-semibold text-primary underline" onClick={() => { setQuery(''); setFilter('all'); }}>필터·검색 초기화</button>} />
                  )}
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const unassigned = !r.mentorId;
              const canBulk = r.canConfirm && unassigned && r.recommendations.length > 0;
              return (
                <tr key={r.caseId} className={`border-b align-top last:border-0 ${r.withdrawn ? 'opacity-60' : ''}`}>
                  <td className="px-2 py-2">
                    {canBulk && (
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-primary sm:h-4 sm:w-4"
                        aria-label={`${r.menteeName} 일괄 확정 대상 선택`}
                        checked={checked.has(r.caseId)}
                        onChange={(e) => setChecked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(r.caseId); else n.delete(r.caseId); return n; })}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2"><RankBadge rank={r.rank} /></td>
                  <td className="px-3 py-2">
                    <Link href={caseHref(r.caseId)} className="font-medium text-primary hover:underline">{r.label}</Link>
                    {/* (P31) 멘티 휴대폰이 행에 실리면 연락 아이콘 — 데이터 확장 전까지는 가드 */}
                    <ContactLinks phone={(r as { menteePhone?: string | null }).menteePhone} name={r.menteeName} size="xs" className="ml-1" />
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
                                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={pending} onClick={() => void confirm(r.caseId, rec.mentorId, rec.mentorName, r.menteeName)}>
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
                      <td className="hidden px-3 py-2 whitespace-nowrap md:table-cell">
                        {r.matchMethod ? (
                          <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', r.matchMethod === 'auto_preferred' ? 'bg-brand-coral/15 text-brand-coral' : r.matchMethod === 'recommended' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-foreground')}>
                            {MATCH_METHOD_LABELS[r.matchMethod]}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="hidden px-3 py-2 whitespace-nowrap md:table-cell">{r.assignedAt ? formatDate(r.assignedAt) : '-'}</td>
                      <td className="hidden px-3 py-2 md:table-cell"><ConfirmMark at={r.confirmedAt} /></td>
                      <td className="hidden px-3 py-2 whitespace-nowrap md:table-cell">{r.surveyDone ? '작성 완료' : '-'}</td>
                    </>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1">
                      {/* 배정 멘토가 있으면 핫핑크 [배정] 버튼만 (P27-05). 배정 이후 단계면 단계명을 함께 표시 */}
                      {r.mentorId ? (
                        <>
                          {r.status !== 'mentor_assigned' && <StatusBadge status={r.status} short />}
                          <button type="button" className={PINK_BTN} onClick={() => setPairsFor(r)} title="배정 근거 — 희망분야 ↔ 멘토 분야 연결 · 매칭 방식">배정</button>
                        </>
                      ) : (
                        <StatusBadge status={r.status} short />
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
          {manualFor && (
            <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-muted-foreground">멘티 희망분야:</span>
              <Chips items={manualFor.needs} tone="amber" max={6} />
            </div>
          )}
          {manualFor && (
            <MentorPickList mentors={mentors} groupId={manualFor.groupId} pick={manualPick} onPick={setManualPick} query={manualQuery} onQuery={setManualQuery} />
          )}
          <DialogFooter className={STICKY_FOOTER}>
            <Button className="h-10 sm:h-9" variant="outline" onClick={() => setManualFor(null)} disabled={pending}>취소</Button>
            <Button className="h-10 bg-brand-pink text-white hover:bg-brand-pink/90 sm:h-9" onClick={() => void doManual()} disabled={pending || !manualPick}>
              <FileCheck2 className="mr-1 h-4 w-4" />{pending ? '매칭 중…' : '매칭(배정) 하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 추천 1순위 일괄 확정 (P30) */}
      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={(o) => { if (!o && !bulkProgress) setBulkOpen(false); }}
        title={`추천 1순위로 일괄 확정 — ${bulkTargets.length}건`}
        description="체크한 멘티를 각자의 추천 1순위 멘토에게 순서대로 확정합니다. 정원·그룹 지정은 건마다 서버에서 다시 검증하며, 앞 건이 확정되면서 정원이 차면 뒤 건은 실패로 표시됩니다."
        impact={[...bulkTargets.slice(0, 8).map((r) => `${r.label} → ${mentorLabel(r.recommendations[0]!.mentorName, r.recommendations[0]!.mentorActive)}`), ...(bulkTargets.length > 8 ? [`외 ${bulkTargets.length - 8}건`] : [])]}
        confirmLabel={bulkProgress ? `진행 중 ${bulkProgress.done}/${bulkProgress.total}` : '일괄 확정'}
        pending={!!bulkProgress}
        onConfirm={runBulk}
        className="max-w-lg"
      >
        {bulkProgress && (
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-brand-pink transition-all" style={{ width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%` }} />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
