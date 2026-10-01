'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BookOpen,
  Building2,
  ClipboardCheck,
  Coins,
  FileSpreadsheet,
  Inbox,
  Link2,
  MessageSquare,
  Network,
  Settings,
  Send,
  Smartphone,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { ProgramMetrics } from '@/lib/reports/metrics';
import type { BudgetOverview } from '@/lib/reports/budget';
import type { DelayedCase } from '@/lib/reports/delays-shared';
import type { TrendMonth } from '@/lib/reports/trend';
import type { InboxItem } from '@/lib/data/requests';
import { BudgetCard } from '@/components/reports/budget-card';
import { GroupProgress, Kpi, MonthlyBars, Panel, Ring, SettlementPipeline, StatusBars, pct } from '@/components/reports/dashboard-charts';
import { DelayList } from '@/components/reports/delay-list';
import { InboxList } from '@/components/nextlab/inbox-list';
import { RoundDots } from '@/components/common/round-dots';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatKRW, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/**
 * 운영사 대시보드 v2 (P27-21) — 숫자 카드 나열 대신 영역을 나눈다:
 *  ① 지금 확인 (알람·처리 대기·놓친 업무: 카드 → 팝업 상세 + 바로가기)
 *  ② 핵심 지표 밴드 (짙은 청색, 큰 숫자 + 링 게이지)
 *  ③ 지표별 맞춤 차트 (단계 분포 · 라운드별 진행 · 정산 파이프라인 · 월별 회차)
 *  ④ 예산 게이지 · ⑤ 바로가기
 * 수치는 전부 metrics/budget/trend 단일 함수에서 온다(여기서 재계산하지 않는다).
 */

export interface DashboardQueueCase {
  caseId: string;
  label: string;
  groupName: string | null;
  statusLabel: string;
  mentorName: string | null;
  roundsDone: number;
  requiredRounds: number;
  createdAt: string;
}

export interface DashboardV2Props {
  scopeLabel: string;
  metrics: ProgramMetrics;
  budget: BudgetOverview;
  trend: TrendMonth[];
  delays: DelayedCase[];
  inbox: InboxItem[];
  assignQueue: DashboardQueueCase[];
  closureQueue: DashboardQueueCase[];
  board: { inquiries: number; posts: number; messages: number };
  /** 멘토가 아직 확인(로그인 열람)하지 않은 배정 수 */
  unconfirmedAssignments: number;
  operatorRequestsUnread: number;
  /** 멘토별 최근 독려 문자 시각 (감사로그) — 지연 목록 "최근 독려" 표시 */
  lastNudges?: Record<string, string>;
  /** (P31) 운영 시작 체크리스트 — 알람 카드 바로 아래에 놓는다(첫날에만 페이지가 넘김) */
  setup?: React.ReactNode;
}


/* ──────────────────── ① 지금 확인 ──────────────────── */

type Tone = 'red' | 'amber' | 'violet' | 'sky' | 'navy';
const TONE_CARD: Record<Tone, { box: string; num: string; icon: string }> = {
  red: { box: 'border-status-rejected/50 bg-status-rejected/10', num: 'text-status-rejected', icon: 'bg-status-rejected text-white' },
  amber: { box: 'border-amber-400 bg-amber-50/80 dark:bg-amber-950/30', num: 'text-amber-700 dark:text-amber-300', icon: 'bg-amber-500 text-white' },
  violet: { box: 'border-violet-400 bg-violet-50/80 dark:bg-violet-950/30', num: 'text-violet-700 dark:text-violet-300', icon: 'bg-violet-500 text-white' },
  sky: { box: 'border-sky-400 bg-sky-50/80 dark:bg-sky-950/30', num: 'text-sky-800 dark:text-sky-300', icon: 'bg-sky-500 text-white' },
  navy: { box: 'border-midnight/40 bg-midnight/5', num: 'text-midnight dark:text-midnight-foreground', icon: 'bg-midnight text-white' },
};

function AlertCard({ icon: Icon, label, value, sub, tone, href, hrefLabel, onDetail }: { icon: LucideIcon; label: string; value: number; sub?: string; tone: Tone; href: string; hrefLabel: string; onDetail?: () => void }) {
  const t = value > 0 ? TONE_CARD[tone] : { box: 'bg-background', num: 'text-muted-foreground', icon: 'bg-muted text-muted-foreground' };
  // (P31) 카드 본체 전체가 탭 타깃 — 상세 팝업이 있으면 팝업, 없으면 바로가기. 보조 설명은 폰에서 숨긴다
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg', t.icon)}><Icon className="h-4 w-4" /></span>
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className={cn('text-3xl font-extrabold leading-none tabular-nums sm:text-4xl', t.num)}>{value}</span>
        <span className="pb-1 text-xs text-muted-foreground">건</span>
      </div>
      {sub && <p className="hidden text-[11px] leading-snug text-muted-foreground sm:block">{sub}</p>}
    </>
  );
  const bodyCls = 'flex w-full flex-col gap-2 text-left';
  return (
    <div className={cn('flex flex-col gap-2 rounded-2xl border-2 p-4 shadow-sm', t.box)}>
      {onDetail ? (
        <button type="button" onClick={onDetail} disabled={value === 0} className={cn(bodyCls, 'disabled:cursor-default')} aria-label={`${label} ${value}건 상세 보기`}>{body}</button>
      ) : (
        <Link href={href} className={bodyCls}>{body}</Link>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        {onDetail && (
          <button type="button" onClick={onDetail} disabled={value === 0} className="inline-flex h-9 items-center rounded-md border bg-background px-2 text-[11px] font-semibold hover:bg-accent disabled:opacity-50 sm:h-7">상세 보기</button>
        )}
        <Link href={href} className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-primary hover:underline sm:h-7">{hrefLabel} <ArrowRight className="h-3 w-3" /></Link>
      </div>
    </div>
  );
}

/* ──────────────────── ② KPI 밴드 ──────────────────── */

/* ──────────────────── ③ 차트 ──────────────────── */

type Period = 'month' | 'all';

/** 기간 세그먼트 — 월별 회차 차트와 이번 달 요약 띠에만 영향 (trend 는 월 단위라 '이번 주'는 만들 수 없다) */
function PeriodSegment({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const opts: { key: Period; label: string }[] = [
    { key: 'month', label: '이번 달' },
    { key: 'all', label: '전체(12개월)' },
  ];
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="group" aria-label="기간">
      {opts.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)} className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors', value === o.key ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 이번 달 요약 띠 — 이행 회차 · 신규 케이스 · 종결 (전체 대비) */
function PeriodStrip({ months, period }: { months: TrendMonth[]; period: Period }) {
  const cur = months[months.length - 1];
  const sum = (k: 'rounds' | 'newCases' | 'closedCases') => months.reduce((a, d) => a + d[k], 0);
  const pick = (k: 'rounds' | 'newCases' | 'closedCases') => (period === 'month' ? (cur?.[k] ?? 0) : sum(k));
  const label = period === 'month' ? `${cur ? Number(cur.month.slice(5, 7)) : '-'}월` : '최근 12개월';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-3 py-1.5 text-xs">
      <span className="font-semibold">{label}</span>
      <span>이행 회차 <b className="tabular-nums">{pick('rounds')}</b>{period === 'month' && <span className="text-muted-foreground"> / 12개월 {sum('rounds')}</span>}</span>
      <span>신규 등록 <b className="tabular-nums">{pick('newCases')}</b></span>
      <span>종결 <b className="tabular-nums">{pick('closedCases')}</b></span>
    </div>
  );
}

function MonthlyRounds({ months: all, period }: { months: TrendMonth[]; period: Period }) {
  const months = period === 'month' ? all.slice(-1) : all;
  return <MonthlyBars months={months} compact={period === 'month'} emptyText={period === 'month' ? '이번 달 이행 회차가 아직 없습니다.' : '아직 이행 회차가 없습니다.'} />;
}

/* ──────────────────── 팝업 상세 ──────────────────── */

function QueueTable({ items, empty }: { items: DashboardQueueCase[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="max-h-[60vh] overflow-y-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/60">
          <tr className="text-left text-muted-foreground"><th className="px-2 py-1.5">멘티</th><th className="px-2 py-1.5">라운드</th><th className="px-2 py-1.5">상태</th><th className="px-2 py-1.5">멘토</th><th className="px-2 py-1.5">회차</th><th className="px-2 py-1.5">등록일</th></tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.caseId} className="border-t">
              <td className="px-2 py-1.5"><Link href={`/nextlab/cases/${c.caseId}`} className="font-medium text-primary hover:underline">{c.label}</Link></td>
              <td className="px-2 py-1.5 whitespace-nowrap">{c.groupName ?? '-'}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{c.statusLabel}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{c.mentorName ?? '-'}</td>
              <td className="px-2 py-1.5"><RoundDots done={c.roundsDone} required={c.requiredRounds} /></td>
              <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(c.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ──────────────────── 본체 ──────────────────── */

const SHORTCUTS: { href: string; label: string; icon: LucideIcon; desc: string }[] = [
  { href: '/nextlab/roster?tab=register', label: '회원 등록', icon: UserPlus, desc: '멘티·멘토·담당자 등록, 엑셀 일괄' },
  { href: '/nextlab/roster?tab=mentee-match', label: '멘티 매칭 리스트', icon: Link2, desc: '추천 확정 · 수동 검색 · 배정 근거' },
  { href: '/nextlab/roster?tab=mentor-match', label: '멘토 매칭 리스트', icon: Network, desc: '담당 멘티 · 지급서류 · 운영사 평가' },
  { href: '/nextlab/settlements', label: '정산 · 품의', icon: Coins, desc: '지급 대기 확인 · 품의 편성 · 지급 완료' },
  { href: '/nextlab/reports', label: '리포트', icon: FileSpreadsheet, desc: '개요 · 진행현황 · 월별 추이 · 엑셀' },
  { href: '/nextlab/surveys', label: '조사', icon: ClipboardCheck, desc: '만족도·사전조사 개설 · 응답 분석' },
  { href: '/admin/settings/sms', label: '문자 발송', icon: Send, desc: '로그인 안내 · 독려 · 예약 발송' },
  { href: '/guide.html#tab-op', label: '이용안내', icon: BookOpen, desc: '운영사 업무 흐름 · 역할별 안내서' },
  { href: '/nextlab/settings', label: '운영 설정', icon: Settings, desc: '그룹 · 단가 · 매칭 규칙 · 권한' },
  // (P31) 휴대폰 홈 화면 설치 안내
  { href: '/nextlab/install', label: '휴대폰 설치', icon: Smartphone, desc: '홈 화면에 앱처럼 추가 · 현장에서 바로' },
];

export function DashboardV2(p: DashboardV2Props) {
  const [detail, setDetail] = useState<'assign' | 'delay' | 'closure' | 'inbox' | null>(null);
  const [period, setPeriod] = useState<Period>('all');
  const m = p.metrics;
  const perf = m.performance;
  const active = perf.cases - perf.byStatus.withdrawn;
  const unassigned = perf.byStatus.registered + perf.byStatus.reassignment_pending;
  const assigned = Math.max(0, active - unassigned);
  const boardTotal = p.board.inquiries + p.board.posts + p.board.messages;
  const missed = m.backlog.unansweredSurveys + m.backlog.unsignedRounds + p.unconfirmedAssignments + m.backlog.mentorsMissingDocs;

  return (
    <div className="flex flex-col gap-6">
      {/* ① 지금 확인 */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-brand-coral" />
          <h2 className="text-base font-bold">지금 확인할 것</h2>
          <span className="hidden text-xs text-muted-foreground sm:inline">카드를 누르면 목록이 열리고, 바로가기로 처리 화면으로 이동합니다.</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <AlertCard icon={Users} label="멘토 배정 대기" value={p.assignQueue.length} sub="새로 등록됐거나 재배정이 필요한 멘티" tone="navy" href="/nextlab/roster?tab=mentee-match&filter=unassigned" hrefLabel="미배정만 보기" onDetail={() => setDetail('assign')} />
          <AlertCard icon={AlertTriangle} label="지연 케이스" value={p.delays.length} sub="배정·첫 회차·장기 무진행·보완 지연 — 독려 문자 가능" tone="red" href="/nextlab/reports?tab=overview#delays" hrefLabel="지연 목록" onDetail={() => setDetail('delay')} />
          <AlertCard icon={ClipboardCheck} label="종결 검수 대기" value={p.closureQueue.length} sub="관찰의견서 제출 · 승인 시 정산 확정" tone="violet" href="/nextlab/review?tab=pending" hrefLabel="검수 대기열 열기" onDetail={() => setDetail('closure')} />
          <AlertCard icon={Inbox} label="처리 대기 요청" value={p.inbox.length} sub="추가 회차 · 멘토 변경 · 중도 종료" tone="amber" href="/nextlab/board?tab=requests" hrefLabel="요청함" onDetail={() => setDetail('inbox')} />
          <AlertCard icon={Building2} label="발주처 요청 미확인" value={p.operatorRequestsUnread} sub="발주처가 보낸 운영 요청 중 아직 읽지 않은 것" tone="amber" href="/nextlab/board?tab=requests" hrefLabel="요청함" />
          <AlertCard icon={MessageSquare} label="게시판 새 소식" value={boardTotal} sub={`문의 ${p.board.inquiries} · 게시글 ${p.board.posts} · 메시지 ${p.board.messages}`} tone="sky" href="/nextlab/board" hrefLabel="게시판" />
        </div>
        {p.setup}
        {missed > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-dashed border-amber-400 bg-amber-50/50 px-4 py-2 text-xs dark:bg-amber-950/20">
            <span className="font-semibold text-amber-800 dark:text-amber-300">놓치기 쉬운 업무</span>
            {p.unconfirmedAssignments > 0 && <Link href="/nextlab/roster?tab=mentor-match" className="hover:underline">멘토 미확인 배정 <b>{p.unconfirmedAssignments}</b>건</Link>}
            {m.backlog.unsignedRounds > 0 && <Link href="/nextlab/reports?tab=cases&status=in_progress" className="hover:underline">멘티 미서명 회차 <b>{m.backlog.unsignedRounds}</b>건</Link>}
            {m.backlog.unansweredSurveys > 0 && <Link href="/nextlab/surveys" className="hover:underline">미응답 만족도 <b>{m.backlog.unansweredSurveys}</b>건</Link>}
            {m.backlog.mentorsMissingDocs > 0 && <Link href="/nextlab/roster?tab=mentor-match" className="hover:underline">지급서류 미수령 멘토 <b>{m.backlog.mentorsMissingDocs}</b>명</Link>}
          </div>
        )}
      </section>

      {/* ② 핵심 지표 밴드 */}
      <section className="rounded-2xl bg-midnight p-5 text-midnight-foreground shadow">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">핵심 지표 · {p.scopeLabel}</h2>
          <Link href="/nextlab/reports" className="text-xs text-brand-teal hover:underline">리포트 전체 →</Link>
        </div>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="멘티 케이스" value={perf.cases} sub={`진행 ${active} · 종결 ${perf.closed} · 중도 ${perf.byStatus.withdrawn}`} />
          <Ring value={pct(assigned, active)} label={`멘토 배정률 (${assigned}/${active})`} />
          <Ring value={pct(perf.roundsDone, perf.roundsPlanned)} label={`회차 이행률 (${perf.roundsDone}/${perf.roundsPlanned})`} color="#60A5FA" />
          <Ring value={Math.round(perf.closureRate * 100)} label={`종결률 (${perf.closed}/${perf.cases})`} color="#A78BFA" />
          <Kpi label="만족도 평균" value={m.evaluation.surveyAvg ?? '-'} sub={`응답 ${m.evaluation.surveyResponses}건 · 운영사 평가 ${m.evaluation.mentorReviewAvg ?? '-'}`} />
          <Kpi wide label="확정 지급 대기" value={formatKRW(m.settlement.pendingNet)} sub={`예상(미확정) ${formatKRW(m.settlement.estimatedGross)}`} />
        </div>
      </section>

      {/* ③ 바로가기 — 처음 쓰는 담당자가 차트보다 먼저 찾는 것 (P28) */}
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-bold">바로가기</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {SHORTCUTS.map((s) => (
            <Link key={s.href} href={s.href} className="group flex items-start gap-3 rounded-xl border-2 bg-background p-3 transition-colors hover:border-primary hover:bg-primary/5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-midnight text-white group-hover:bg-primary"><s.icon className="h-4 w-4" /></span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-[11px] text-muted-foreground">{s.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ④ 차트 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="진행 단계 분포" sub="케이스가 어느 단계에 몰려 있는지 — 붉은 막대(재배정 대기·보완 요청·중도 종료)는 조치가 필요한 단계">
          <StatusBars m={m} />
        </Panel>
        <Panel title="라운드(그룹)별 진행" sub="케이스 · 배정 · 미배정 · 종결과 회차 이행률">
          <GroupProgress m={m} />
        </Panel>
        <Panel title="정산 파이프라인" sub="예상(미확정 이행 회차) → 지급 대기 → 품의 → 정산 확인 → 지급 완료">
          <SettlementPipeline m={m} />
        </Panel>
        <Panel title={period === 'month' ? '이번 달 이행 회차' : '월별 이행 회차 (최근 12개월)'} sub="막대를 누르면 신규·종결도 함께 표시 · 기간은 이 차트와 요약 띠에만 적용">
          <div className="flex items-center justify-between gap-2">
            <PeriodSegment value={period} onChange={setPeriod} />
          </div>
          <PeriodStrip months={p.trend} period={period} />
          <MonthlyRounds months={p.trend} period={period} />
        </Panel>
      </div>

      {/* ⑤ 예산 */}
      <BudgetCard overview={p.budget} settingsHint />

      {/* 팝업 상세 */}
      <Dialog open={detail === 'assign'} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>멘토 배정 대기 {p.assignQueue.length}건</DialogTitle><DialogDescription>새로 등록됐거나 멘토 중도 종료로 재배정이 필요한 케이스. 멘티 매칭 리스트에서 추천 확정 또는 수동 검색으로 배정하세요.</DialogDescription></DialogHeader>
          <QueueTable items={p.assignQueue} empty="배정 대기 건이 없습니다." />
          <Link href="/nextlab/roster?tab=mentee-match" className="text-sm font-semibold text-primary hover:underline">멘티 매칭 리스트로 이동 →</Link>
        </DialogContent>
      </Dialog>
      <Dialog open={detail === 'closure'} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>종결 검수 대기 {p.closureQueue.length}건</DialogTitle><DialogDescription>멘토가 관찰의견서를 제출하고 종결을 요청한 케이스. 케이스 상세에서 검수 승인하면 정산이 확정됩니다.</DialogDescription></DialogHeader>
          <QueueTable items={p.closureQueue} empty="검수 대기 건이 없습니다." />
        </DialogContent>
      </Dialog>
      <Dialog open={detail === 'delay'} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>지연 케이스 {p.delays.length}건</DialogTitle><DialogDescription>배정 지연 · 재배정 지연 · 첫 회차 없음 · 장기 무진행 · 보완 지연. 멘토별로 독려 문자를 보낼 수 있습니다.</DialogDescription></DialogHeader>
          <DelayList items={p.delays} caseHrefBase="/nextlab/cases" canNudge lastNudges={p.lastNudges} />
        </DialogContent>
      </Dialog>
      <Dialog open={detail === 'inbox'} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>처리 대기 요청 {p.inbox.length}건</DialogTitle><DialogDescription>추가 회차 · 멘토 변경 · 중도 종료 요청. 추가 회차·중도 종료는 여기서 바로 승인/반려할 수 있고, 멘토 변경은 케이스 상세에서 처리합니다.</DialogDescription></DialogHeader>
          {/* (P31) 6열 표 대신 요청함과 같은 InboxList — 폰에서도 사유 전문·승인/반려 인라인 */}
          <InboxList items={p.inbox} />
          <Link href="/nextlab/board?tab=requests" className="text-sm font-semibold text-primary hover:underline">요청함으로 이동 →</Link>
        </DialogContent>
      </Dialog>
    </div>
  );
}
