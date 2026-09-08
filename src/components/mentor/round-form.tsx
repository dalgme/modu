'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Clock, MapPin, Monitor, Plus, Users } from 'lucide-react';

import { submitRoundAction } from '@/lib/workflow/mentor-actions';
import type { RoundParticipant } from '@/lib/workflow/rounds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

/** 10분 단위 24시간제 시각 옵션 (00:00 ~ 23:50) */
const TIME_OPTIONS: string[] = Array.from({ length: 24 * 6 }, (_, i) => {
  const h = Math.floor(i / 6);
  const m = (i % 6) * 10;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function durationLabel(minutes: number): string {
  if (minutes <= 0) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간${m > 0 ? ` ${m}분` : ''}` : `${m}분`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export interface ParticipantOption {
  key: string;
  name: string;
  /** representative = 멘티 본인·팀 대표 / member = 팀원 */
  role: 'representative' | 'member';
  subLabel?: string;
}

/** 시각 선택 — 24시간제 10분 단위 클릭 선택 */
function TimeSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-md border border-input bg-background px-2 text-sm tabular-nums"
    >
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}

/**
 * 회차 1단계 등록 (계획/실행) — 통계·정산의 기본데이터.
 * 일자·시간(10분 단위)·방법·참가자는 전부 클릭 선택, 장소만 직접 입력.
 * 사전(계획)·사후(실행) 등록 모두 가능하고, 보고서(실서류)는 2단계에서 등록한다.
 */
export function RoundForm({ caseId, nextRoundNo, maxRounds, rates, participantOptions }: {
  caseId: string;
  nextRoundNo: number;
  maxRounds: number;
  rates: { online: number | null; offline: number | null };
  /** 멘티(대표) + 팀원 선택지 — 첫 항목이 멘티 본인 */
  participantOptions: ParticipantOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'online' | 'offline'>('offline');
  const [date, setDate] = useState(todayLocal());
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:00');
  const [place, setPlace] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(participantOptions.length ? [participantOptions[0]!.key] : []));
  const full = nextRoundNo > maxRounds;

  const startDate = useMemo(() => new Date(`${date}T${startTime}:00`), [date, startTime]);
  const endDate = useMemo(() => new Date(`${date}T${endTime}:00`), [date, endTime]);
  const minutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
  const isPlan = startDate.getTime() > Date.now();
  const chosen = participantOptions.filter((p) => selected.has(p.key));

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = () => {
    if (Number.isNaN(startDate.getTime())) return toast({ title: '일자를 선택하세요.', variant: 'destructive' });
    if (minutes <= 0) return toast({ title: '종료 시각이 시작 시각보다 늦어야 합니다.', variant: 'destructive' });
    if (chosen.length === 0) return toast({ title: '참가자를 1명 이상 선택하세요.', variant: 'destructive' });
    const participants: RoundParticipant[] = chosen.map((p) => ({ name: p.name, role: p.role }));
    start(async () => {
      const r = await submitRoundAction({
        caseId,
        mode,
        startedAt: startDate.toISOString(),
        endedAt: endDate.toISOString(),
        place,
        participants,
      });
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: `${r.roundNo}회차를 ${isPlan ? '계획으로 ' : ''}등록했습니다. 진행 후 [보고서 등록]으로 실서류를 등록하세요.` });
      setOpen(false);
      setPlace('');
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} disabled={full} className="gap-1">
        <Plus className="h-4 w-4" /> {full ? `회차 상한(${maxRounds}회) 도달` : `${nextRoundNo}회차 등록 (계획/실행)`}
      </Button>
    );
  }

  const d = new Date(`${date}T00:00:00`);
  const dateLabel = Number.isNaN(d.getTime()) ? date : `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-background p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{nextRoundNo}회차 등록 — 1단계 · 계획/실행 정보</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isPlan ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}>
          {isPlan ? '사전(계획) 등록' : '사후(실행) 등록'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        일시·방법·참가자는 통계와 지급액 정산의 기본데이터입니다. 실서류(멘토링 보고서)는 진행 후 2단계 [보고서 등록]에서 올립니다.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="r-date">일자</Label>
          <Input id="r-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>시간 (24시간제 · 10분 단위)</Label>
          <div className="flex items-center gap-1">
            <TimeSelect id="r-start" value={startTime} onChange={setStartTime} />
            <span className="text-sm text-muted-foreground">~</span>
            <TimeSelect id="r-end" value={endTime} onChange={setEndTime} />
            <span className={`ml-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold tabular-nums ${minutes > 0 ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
              {minutes > 0 ? `${durationLabel(minutes)} 운영` : '시간 확인'}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label>방법</Label>
          <div className="flex gap-2">
            {(['offline', 'online'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${mode === m ? 'border-primary bg-primary/10 font-semibold' : ''}`}
              >
                {m === 'online' ? '온라인' : '오프라인'}
                <span className="ml-1 text-xs text-muted-foreground">
                  {rates[m] != null ? `${rates[m]!.toLocaleString('ko-KR')}원` : '단가 미설정'}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="r-place">{mode === 'online' ? '온라인 도구·링크' : '장소'}</Label>
          <Input id="r-place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={mode === 'online' ? '예: Zoom' : '예: 세종 창업카페 2층'} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label>참가자 <span className="text-xs font-normal text-muted-foreground">(클릭으로 복수 선택 — 멘티 개인·팀 대표·팀원)</span></Label>
        <div className="flex flex-wrap gap-1.5">
          {participantOptions.map((p) => {
            const on = selected.has(p.key);
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => toggle(p.key)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                {p.name}
                <span className={`ml-1 text-xs ${on ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  {p.role === 'representative' ? '대표' : p.subLabel || '팀원'}
                </span>
              </button>
            );
          })}
        </div>
        {participantOptions.length <= 1 && (
          <p className="text-[11px] text-muted-foreground">팀원 명단은 운영사가 케이스 상세의 [팀 정보]에서 등록합니다.</p>
        )}
      </div>

      {/* 선택 요약 — 등록 전 한눈에 확인 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-primary" /> <b>{dateLabel}</b></span>
        <span className="inline-flex items-center gap-1.5 tabular-nums"><Clock className="h-4 w-4 text-primary" /> {startTime} ~ {endTime} <b className="text-primary">({durationLabel(Math.max(0, minutes))})</b></span>
        <span className="inline-flex items-center gap-1.5"><Monitor className="h-4 w-4 text-primary" /> <b>{mode === 'online' ? '온라인' : '오프라인'}</b></span>
        <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /> {chosen.length > 0 ? chosen.map((p) => p.name).join(' · ') : <span className="text-destructive">참가자 미선택</span>} {chosen.length > 0 && <b>({chosen.length}명)</b>}</span>
        <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" /> {place.trim() || <span className="text-muted-foreground">장소 미입력</span>}</span>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
          취소
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? '등록 중…' : isPlan ? '계획 등록' : '회차 등록'}
        </Button>
      </div>
    </div>
  );
}
