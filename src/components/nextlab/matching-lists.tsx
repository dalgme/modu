'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Download, RefreshCw, Search, Undo2, UserCheck } from 'lucide-react';

import type { MenteeMatchRow, MentorMatchRow } from '@/lib/data/matching-lists';
import { confirmMatchAction } from '@/lib/matching/actions';
import { reassignMentorAction, recallMentorAction } from '@/lib/workflow/case-actions';
import { matchedPairs } from '@/lib/matching/eligibility';
import { MentorName } from '@/components/common/mentor-name';
import { RoundDots } from '@/components/common/round-dots';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { mentorLabel } from '@/lib/utils/labels';
import { formatDate } from '@/lib/utils/format';

/** P24·P25 매칭 리스트 — 멘토 기준 / 멘티 기준. 확인 여부 = 멘토가 로그인해 배정을 열람한 시각. */

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

function ListToolbar({ query, onQuery, exportHref, summary }: { query: string; onQuery: (v: string) => void; exportHref: string; summary: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-background px-4 py-2.5">
      <div className="text-sm font-semibold">{summary}</div>
      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="이름 검색" className="h-9 w-44 pl-8" />
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1">
          <a href={exportHref}>
            <Download className="h-4 w-4" /> 엑셀 다운로드
          </a>
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────────────── 멘토 매칭 리스트 ──────────────────────────── */

export function MentorMatchList({ rows, caseHrefBase = '/nextlab/cases' }: { rows: MentorMatchRow[]; caseHrefBase?: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState('');
  const [reassign, setReassign] = useState<{ caseId: string; menteeLabel: string; currentMentorId: string } | null>(null);
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
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.mentees.length > 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
              {m.mentees.length > 0 ? `담당 멘티 ${m.mentees.length}` : '미배정 (Pool)'}
            </span>
          </div>
          {m.mentees.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-1">멘티</th>
                    <th className="px-2 py-1">라운드</th>
                    <th className="px-2 py-1">매칭 일자</th>
                    <th className="px-2 py-1">확인 여부</th>
                    <th className="px-2 py-1">컨설팅 진행현황</th>
                    <th className="px-2 py-1">배정 관리</th>
                  </tr>
                </thead>
                <tbody>
                  {m.mentees.map((c) => (
                    <tr key={c.caseId} className="border-b last:border-0">
                      <td className="px-2 py-1.5">
                        <Link href={`${caseHrefBase}/${c.caseId}`} className="font-medium text-primary hover:underline">{c.label}</Link>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{c.groupName ?? '-'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{c.assignedAt ? formatDate(c.assignedAt) : '-'}</td>
                      <td className="px-2 py-1.5"><ConfirmMark at={c.confirmedAt} /></td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className="mr-1.5">{c.statusLabel}</span>
                        <RoundDots done={c.roundsDone} required={c.requiredRounds} />
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" disabled={!c.canRecall || pending} title={c.canRecall ? '배정을 해제하고 등록 단계로' : '회차가 시작되어 회수할 수 없습니다 — 재배정 또는 케이스 상세의 강제 중도 종료를 사용'} onClick={() => recall(c.caseId, c.label)}>
                            <Undo2 className="h-3 w-3" /> 멘토 회수
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" disabled={!c.canReassign || pending} title={c.canReassign ? '다른 멘토로 즉시 교체(잔여 회차 승계)' : '이 단계에서는 재배정할 수 없습니다'} onClick={() => { setReassign({ caseId: c.caseId, menteeLabel: c.label, currentMentorId: m.mentorId }); setNewMentorId(undefined); }}>
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
            <DialogDescription>{reassign?.menteeLabel} 멘티를 다른 멘토로 교체합니다. 진행한 회차는 그대로 두고 잔여 회차를 새 멘토가 승계합니다. 라운드별 정원(매칭 규칙)을 넘는 멘토는 서버에서 거부됩니다.</DialogDescription>
          </DialogHeader>
          <Select value={newMentorId} onValueChange={setNewMentorId}>
            <SelectTrigger><SelectValue placeholder="새 멘토 선택" /></SelectTrigger>
            <SelectContent>
              {rows.filter((x) => x.mentorId !== reassign?.currentMentorId).map((x) => (
                <SelectItem key={x.mentorId} value={x.mentorId}>{mentorLabel(x.mentorName, x.mentees.length)}{x.designatedGroupNames.length ? ` · 지정 ${x.designatedGroupNames.join('/')}` : ''}</SelectItem>
              ))}
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

/* ──────────────────────────── 멘티 매칭 리스트 ──────────────────────────── */

export function MenteeMatchList({ rows, caseHrefBase = '/nextlab/cases' }: { rows: MenteeMatchRow[]; caseHrefBase?: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState('');
  const [pairsFor, setPairsFor] = useState<MenteeMatchRow | null>(null);

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

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        query={query}
        onQuery={setQuery}
        exportHref="/api/nextlab/roster-export?tab=mentee-match"
        summary={
          <>
            전체 멘티 인원 : <b>{rows.length}명</b> <span className="mx-1 text-muted-foreground">/</span> 멘토 배정된 인원 : <b>{assigned}명</b>
          </>
        }
      />
      <p className="text-xs text-muted-foreground">
        재배치 희망 멘토가 후보 자격(그룹 지정·라운드 정원)이면 등록 시 자동 확정됩니다. 아니면 희망분야 1~6순위 순서로 후보 멘토 최대 3명이 추천되며 [매칭 확정]을 누르면 배정됩니다.
        추천 옆 <b>(n)</b>은 그 멘토의 현재 확정 멘티 수입니다. 확정된 멘토는 다른 멘티의 추천에서 자동 재계산됩니다.
      </p>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2">멘티 · 희망분야</th>
              <th className="px-3 py-2">라운드</th>
              <th className="px-3 py-2">배정 멘토 / 추천</th>
              <th className="px-3 py-2">매칭 일자</th>
              <th className="px-3 py-2">확인(멘토)</th>
              <th className="px-3 py-2">만족도</th>
              <th className="px-3 py-2">진행</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">해당하는 멘티가 없습니다.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.caseId} className={`border-b align-top last:border-0 ${r.withdrawn ? 'opacity-60' : ''}`}>
                <td className="px-3 py-2">
                  <Link href={`${caseHrefBase}/${r.caseId}`} className="font-medium text-primary hover:underline">{r.label}</Link>
                  <div className="mt-1"><Chips items={r.needs} tone="amber" max={6} /></div>
                  {r.preferredMentor && <p className="mt-0.5 text-[11px] text-muted-foreground">재배치 희망: {r.preferredMentor}</p>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{r.groupName ?? '-'}</td>
                <td className="px-3 py-2">
                  {r.mentorId && r.mentorName ? (
                    <span className="inline-flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <MentorName id={r.mentorId} name={r.mentorName} count={r.mentorActive} caseHrefBase={caseHrefBase} />
                    </span>
                  ) : r.recommendations.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {r.recommendations.map((rec) => (
                        <div key={rec.mentorId} className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">추천 {rec.rank}</span>
                          <MentorName id={rec.mentorId} name={rec.mentorName} count={rec.mentorActive} caseHrefBase={caseHrefBase} />
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200" title="추천 점수">{Math.round(rec.score)}점</span>
                          <span className="max-w-[18rem] truncate text-[11px] text-muted-foreground" title={rec.rationale ?? undefined}>{rec.rationale ?? ''}</span>
                          {r.canConfirm && (
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={pending} onClick={() => confirm(r.caseId, rec.mentorId, rec.mentorName, r.menteeName)}>
                              매칭 확정
                            </Button>
                          )}
                          <Chips items={rec.expertise} max={10} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">미배정 · 추천 없음</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{r.assignedAt ? formatDate(r.assignedAt) : '-'}</td>
                <td className="px-3 py-2">{r.mentorName ? <ConfirmMark at={r.confirmedAt} /> : '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.surveyDone ? '작성 완료' : '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex flex-col items-start gap-1">
                    <span>{r.statusLabel}</span>
                    {r.mentorId && (
                      <Button size="sm" variant="secondary" className="h-6 px-2 text-[11px]" onClick={() => setPairsFor(r)} title="희망분야 ↔ 멘토 분야 연결 보기">
                        배정
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!pairsFor} onOpenChange={(o) => { if (!o) setPairsFor(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>배정 근거 — 희망분야 ↔ 멘토 분야</DialogTitle>
            <DialogDescription>
              {pairsFor?.label} ↔ {pairsFor?.mentorName ? mentorLabel(pairsFor.mentorName, pairsFor.mentorActive) : '-'}
            </DialogDescription>
          </DialogHeader>
          {pairsFor && (
            <div className="flex flex-col gap-3 text-sm">
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
    </div>
  );
}
