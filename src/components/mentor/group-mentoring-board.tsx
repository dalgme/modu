'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Clock, Monitor, Plus, Users } from 'lucide-react';

import type { GroupMentoringRound, GroupSessionItem } from '@/lib/workflow/group-mentoring';
import { createGroupSessionAction, deleteGroupSessionAction, updateGroupSessionAction } from '@/lib/workflow/group-mentoring-actions';
import { GROUP_MIN_MENTEES } from '@/lib/workflow/group-mentoring-rule';
import { amountForMinutes } from '@/lib/settlement/round-amount';
import { HourlyOnlyNotice, PastScheduleNotice, TimeSelect, endAfterStartChange, plusMinutes } from '@/components/mentor/round-form';
import { OVERNIGHT_MAX_MINUTES, roundSpan, roundTimeRangeLabel } from '@/lib/workflow/round-time';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { kstMd, kstTodayYmd, toKstParts } from '@/lib/utils/kst';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const pad = (n: number) => String(n).padStart(2, '0');

function kstDateTime(iso: string): { date: string; time: string } {
  const p = toKstParts(iso);
  if (!p) return { date: kstTodayYmd(), time: '14:00' };
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.hh)}:00` };
}

/**
 * 멘토 [그룹멘토링] 화면 (2026-11-04).
 * 라운드마다: 사용 n/O회 · [그룹멘토링 일정 등록](내가 매칭된 멘티만 선택) · 등록한 그룹멘토링 목록(멘티별 회차·보고서 현황).
 * 보고서는 멘티마다 각 멘티 화면의 회차 행에서 올린다. 수당은 그룹멘토링 1회당 1회분.
 */
export function GroupMentoringBoard({ rounds }: { rounds: GroupMentoringRound[] }) {
  if (rounds.length === 0) {
    return (
      <p className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        그룹멘토링을 사용하는 라운드가 없거나, 그 라운드에 매칭된 멘티가 없습니다. 그룹멘토링 사용 여부와 횟수는 운영사가 라운드별로 정합니다.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {rounds.map((r) => (
        <RoundCard key={r.groupId} round={r} />
      ))}
    </div>
  );
}

function RoundCard({ round }: { round: GroupMentoringRound }) {
  const eligible = round.cases.filter((c) => !c.blocked);
  const createBlocked = !round.enabled
    ? '이 라운드는 지금 그룹멘토링을 사용하지 않습니다.'
    : round.limitError ?? (eligible.length < GROUP_MIN_MENTEES ? `회차를 등록할 수 있는 매칭 멘티가 ${GROUP_MIN_MENTEES}명 이상이어야 합니다.` : null);
  return (
    <section className="rounded-xl border bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{round.groupName}</h2>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', round.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground')}>
          {round.enabled ? `그룹멘토링 ${round.used}/${round.maxPerMentor}회 사용` : '그룹멘토링 사용 안 함'}
        </span>
        <span className="ml-auto">
          <CreateDialog round={round} blocked={createBlocked} />
        </span>
      </div>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
        <li>내가 매칭된 멘티만 함께 묶을 수 있습니다. 참여한 멘티는 각자 <b>1회의 멘토링</b>을 받은 것으로 기록됩니다.</li>
        <li>보고서는 <b>멘티마다 따로</b> 작성해 각 멘티 화면의 해당 회차에 올립니다.</li>
        <li>멘토 수당은 그룹멘토링 1회당 <b>1회분</b>(시간당 단가 × 운영시간)만 지급됩니다 — 참여 멘티 중 보고서가 먼저 등록된 회차에 잡힙니다.</li>
      </ul>
      {createBlocked && round.enabled && <p className="mt-2 text-xs font-medium text-amber-700">{createBlocked}</p>}
      {round.sessions.length > 0 && (
        <ol className="mt-3 flex flex-col gap-2">
          {round.sessions.map((s, i) => (
            <SessionRow key={s.id} index={i + 1} session={s} round={round} />
          ))}
        </ol>
      )}
    </section>
  );
}

function ScheduleFields({
  date, setDate, startTime, setStartTime, endTime, setEndTime, mode, setMode, place, setPlace, rates,
}: {
  date: string; setDate: (v: string) => void; startTime: string; setStartTime: (v: string) => void; endTime: string; setEndTime: (v: string) => void;
  mode: 'online' | 'offline'; setMode: (v: 'online' | 'offline') => void; place: string; setPlace: (v: string) => void; rates: { online: number | null; offline: number | null };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="g-date">일자</Label>
        <Input id="g-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>시간 (24시간제 · 1시간 단위)</Label>
        <div className="flex flex-wrap items-center gap-1">
          <TimeSelect id="g-start" value={startTime} onChange={(v) => { setEndTime(endAfterStartChange(date, startTime, endTime, v)); setStartTime(v); }} />
          <span className="text-sm text-muted-foreground">~</span>
          <TimeSelect id="g-end" value={endTime} onChange={setEndTime} startHm={startTime} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label>방법</Label>
        <div className="flex gap-2">
          {(['offline', 'online'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-lg border px-3 py-2 text-sm ${mode === m ? 'border-primary bg-primary/10 font-semibold' : ''}`}>
              {m === 'online' ? '온라인' : '오프라인'}
              <span className="ml-1 text-xs text-muted-foreground">{rates[m] != null ? `시간당 ${rates[m]!.toLocaleString('ko-KR')}원` : '단가 미설정'}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="g-place">{mode === 'online' ? '온라인 도구·링크' : '장소'}</Label>
        <Input id="g-place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={mode === 'online' ? '예: Zoom' : '예: 창업카페 2층'} />
      </div>
    </div>
  );
}

function useSchedule(initial?: GroupSessionItem) {
  const s = initial ? kstDateTime(initial.startedAt) : { date: kstTodayYmd(), time: '14:00' };
  const e = initial ? kstDateTime(initial.endedAt) : { date: s.date, time: plusMinutes(s.time, 120) };
  const [date, setDate] = useState(s.date);
  const [startTime, setStartTime] = useState(s.time);
  const [endTime, setEndTime] = useState(e.time);
  const [mode, setMode] = useState<'online' | 'offline'>(initial?.mode ?? 'offline');
  const [place, setPlace] = useState(initial?.place ?? '');
  // 종료가 시작과 같거나 이르면 다음 날 (2026-11-10, round-time.ts) — 서버 검증과 같은 규칙
  const span = useMemo(() => roundSpan(date, startTime, endTime), [date, startTime, endTime]);
  const startDate = useMemo(() => new Date(span?.startIso ?? NaN), [span]);
  const endDate = useMemo(() => new Date(span?.endIso ?? NaN), [span]);
  const minutes = span ? (span.overnight && span.minutes > OVERNIGHT_MAX_MINUTES ? -1 : span.minutes) : 0;
  return { date, setDate, startTime, setStartTime, endTime, setEndTime, mode, setMode, place, setPlace, startDate, endDate, minutes };
}

function CreateDialog({ round, blocked }: { round: GroupMentoringRound; blocked: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const sc = useSchedule();
  const fee = round.rates[sc.mode] != null && sc.minutes > 0 ? amountForMinutes(round.rates[sc.mode]!, sc.minutes) : null;
  const isPlan = sc.startDate.getTime() > Date.now();

  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const submit = () => {
    if (picked.size < GROUP_MIN_MENTEES) return toast({ title: `멘티를 ${GROUP_MIN_MENTEES}명 이상 선택하세요.`, variant: 'destructive' });
    if (sc.minutes <= 0) return toast({ title: sc.minutes === 0 ? '시작과 종료 시각이 같습니다.' : `자정을 넘는 회차는 최대 ${OVERNIGHT_MAX_MINUTES / 60}시간까지 등록할 수 있습니다.`, variant: 'destructive' });
    start(async () => {
      const r = await createGroupSessionAction({ supportTypeId: round.groupId, caseIds: Array.from(picked), mode: sc.mode, startedAt: sc.startDate.toISOString(), endedAt: sc.endDate.toISOString(), place: sc.place });
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: r.message ?? '등록했습니다.' });
      setOpen(false);
      setPicked(new Set());
      router.refresh();
    });
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={!!blocked} title={blocked ?? undefined} className="gap-1">
        <Plus className="h-4 w-4" /> 그룹멘토링 일정 등록
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">{round.groupName} · 그룹멘토링 일정 등록 ({round.used + 1}/{round.maxPerMentor}회)</DialogTitle>
            <DialogDescription>함께 진행할 멘티를 고르고 일정을 정합니다. 멘티마다 다음 회차로 1회씩 기록됩니다.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {!isPlan && <PastScheduleNotice />}
            <HourlyOnlyNotice />
            <div className="flex flex-col gap-1">
              <Label>참여 멘티 <span className="text-xs font-normal text-muted-foreground">(내가 매칭된 이 라운드 멘티 · {GROUP_MIN_MENTEES}명 이상)</span></Label>
              <div className="flex flex-col gap-1.5">
                {round.cases.map((c) => {
                  const on = picked.has(c.caseId);
                  return (
                    <label key={c.caseId} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', c.blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/50', on && 'border-primary bg-primary/5')}>
                      <input type="checkbox" className="h-4 w-4" disabled={!!c.blocked} checked={on} onChange={() => toggle(c.caseId)} />
                      <b>{c.menteeName}</b>
                      <span className="text-xs text-muted-foreground">{c.blocked ?? `${c.nextRoundNo}회차로 기록 (총 ${c.maxRounds}회)`}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <ScheduleFields {...sc} rates={round.rates} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-primary" /> <b>{sc.date}</b></span>
              <span className="inline-flex items-center gap-1.5 tabular-nums"><Clock className="h-4 w-4 text-primary" /> {sc.startTime} ~ {sc.endTime}</span>
              <span className="inline-flex items-center gap-1.5"><Monitor className="h-4 w-4 text-primary" /> <b>{sc.mode === 'online' ? '온라인' : '오프라인'}</b></span>
              <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /> 멘티 <b>{picked.size}명</b> · 각 1회차</span>
              {fee != null && <span className="inline-flex items-center gap-1.5 tabular-nums">멘토 수당 <b className="text-primary">{fee.toLocaleString('ko-KR')}원 (1회분)</b></span>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>취소</Button>
              <Button onClick={submit} disabled={pending}>{pending ? '등록 중…' : '그룹멘토링 등록'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SessionRow({ index, session, round }: { index: number; session: GroupSessionItem; round: GroupMentoringRound }) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const caseIds = session.participants.map((p) => p.caseId);
  const future = new Date(session.startedAt).getTime() > Date.now();
  const weekday = WEEKDAYS[toKstParts(session.startedAt)?.weekday ?? 0];
  const reportedCount = session.participants.filter((p) => p.reported).length;

  const remove = async () => {
    const ok = await confirm({
      title: `그룹멘토링 ${index}회 삭제`,
      description: '참여 멘티의 이 회차(계획)가 함께 삭제됩니다.',
      impact: session.participants.map((p) => `${p.menteeName} ${p.roundNo}회차`),
      confirmLabel: '삭제',
      severity: 'danger',
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteGroupSessionAction({ sessionId: session.id, caseIds });
      toast(r.ok ? { title: r.message ?? '삭제했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });
  };

  return (
    <li className="rounded-lg border p-3">
      {dialog}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-md border-2 border-violet-500 bg-violet-50 px-3 py-1 text-sm font-bold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">그룹 {index}회</span>
        <span className="flex flex-wrap items-center gap-x-2 text-sm tabular-nums">
          <b>{session.mode === 'online' ? '온라인' : '오프라인'}</b>
          <span className="text-muted-foreground">/</span>
          {kstMd(session.startedAt)}({weekday}) {roundTimeRangeLabel(session.startedAt, session.endedAt)}
          {session.place && <><span className="text-muted-foreground">/</span>{session.place}</>}
          <span className="text-muted-foreground">/</span>
          수당 {session.fee.toLocaleString('ko-KR')}원 (1회분)
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', future ? 'bg-sky-100 text-sky-800' : reportedCount === session.participants.length ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>
          {future ? '예정 (진행 전)' : `보고서 ${reportedCount}/${session.participants.length}명`}
        </span>
        <span className="ml-auto flex gap-1.5">
          {session.editable && (
            <>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)}>일정 수정</Button>
              <Button size="sm" variant="ghost" className="text-status-rejected" disabled={pending} onClick={() => void remove()}>삭제</Button>
            </>
          )}
        </span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {session.participants.map((p) => (
          <li key={p.logId}>
            <Link href={`/mentor/cases/${p.caseId}#rounds`} className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:bg-muted', p.reported ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : '')}>
              <b>{p.menteeName}</b> {p.roundNo}회차 · {p.reported ? '보고서 등록됨' : future ? '예정' : '보고서 올리기 →'}
              {p.holder && <span className="rounded bg-violet-100 px-1 text-[10px] text-violet-800">수당</span>}
            </Link>
          </li>
        ))}
      </ul>
      <Dialog open={editing} onOpenChange={(o) => !pending && setEditing(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">그룹 {index}회 일정 수정</DialogTitle>
            <DialogDescription>참여 멘티 전원의 회차 일정이 함께 바뀝니다. (보고서가 등록되기 전까지만)</DialogDescription>
          </DialogHeader>
          {editing && <EditForm session={session} round={round} onDone={() => setEditing(false)} />}
        </DialogContent>
      </Dialog>
    </li>
  );
}

function EditForm({ session, round, onDone }: { session: GroupSessionItem; round: GroupMentoringRound; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const sc = useSchedule(session);
  const submit = () => {
    if (sc.minutes <= 0) return toast({ title: sc.minutes === 0 ? '시작과 종료 시각이 같습니다.' : `자정을 넘는 회차는 최대 ${OVERNIGHT_MAX_MINUTES / 60}시간까지 등록할 수 있습니다.`, variant: 'destructive' });
    start(async () => {
      const r = await updateGroupSessionAction({ sessionId: session.id, mode: sc.mode, startedAt: sc.startDate.toISOString(), endedAt: sc.endDate.toISOString(), place: sc.place, caseIds: session.participants.map((p) => p.caseId) });
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: r.message ?? '수정했습니다.' });
      onDone();
      router.refresh();
    });
  };
  return (
    <div className="flex flex-col gap-4">
      <HourlyOnlyNotice />
      <ScheduleFields {...sc} rates={round.rates} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={pending}>취소</Button>
        <Button onClick={submit} disabled={pending}>{pending ? '저장 중…' : '저장'}</Button>
      </div>
    </div>
  );
}
