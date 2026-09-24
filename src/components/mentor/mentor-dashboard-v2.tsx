import Link from 'next/link';
import { AlertTriangle, ArrowRight, BookOpen, CalendarDays, CheckCircle2, ClipboardEdit, Coins, FileText, Mail, Phone, Users } from 'lucide-react';

import type { MentorDashboardData, MentorActionKey } from '@/lib/data/role-dashboard';
import type { CaseListItem } from '@/lib/data/cases';
import type { Branding } from '@/lib/programs/branding';
import { CaseCard } from '@/components/cases/case-card';
import { RoundDots } from '@/components/common/round-dots';
import { formatKRW } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/**
 * 멘토 대시보드 v2 (P28) — "지금 할 일" 우선.
 * ① 요약 칩(담당·보고서 대기·이번 주 일정·예상 지급) ② 케이스별 다음 할 일 카드(긴급 순) ③ 이번 주 일정 ④ 담당 멘티 전체.
 * 실제 멘토 화면과 운영사 화면 보기(view-as)에서 공용 — basePath/guideHref 만 다르다.
 */

const KEY_STYLE: Record<MentorActionKey, { bar: string; chip: string }> = {
  report: { bar: 'bg-status-rejected', chip: 'bg-status-rejected/10 text-status-rejected' },
  revision: { bar: 'bg-status-rejected', chip: 'bg-status-rejected/10 text-status-rejected' },
  plan_first: { bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800' },
  observation: { bar: 'bg-violet-500', chip: 'bg-violet-100 text-violet-800' },
  closure: { bar: 'bg-violet-500', chip: 'bg-violet-100 text-violet-800' },
  upcoming: { bar: 'bg-sky-500', chip: 'bg-sky-100 text-sky-900' },
  plan_next: { bar: 'bg-amber-400', chip: 'bg-amber-50 text-amber-800' },
  wait_review: { bar: 'bg-muted-foreground/40', chip: 'bg-muted text-muted-foreground' },
  settled: { bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800' },
  inactive: { bar: 'bg-muted-foreground/30', chip: 'bg-muted text-muted-foreground' },
};

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${day}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function Chip({ icon: Icon, label, value, tone = 'default', href }: { icon: typeof Users; label: string; value: string | number; tone?: 'default' | 'warn' | 'good'; href?: string }) {
  const cls = cn(
    'flex items-center gap-2.5 rounded-xl border-2 bg-background px-3 py-2.5',
    tone === 'warn' && 'border-status-rejected/50 bg-status-rejected/5',
    tone === 'good' && 'border-emerald-300 bg-emerald-50/50',
  );
  const inner = (
    <>
      <Icon className={cn('h-5 w-5 shrink-0', tone === 'warn' ? 'text-status-rejected' : tone === 'good' ? 'text-emerald-600' : 'text-primary')} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="truncate text-base font-bold tabular-nums">{value}</span>
      </span>
    </>
  );
  return href ? <Link href={href} className={cn(cls, 'hover:bg-accent/40')}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function MentorDashboardV2({
  name,
  data,
  cases,
  basePath,
  branding,
  guideHref,
  scheduleHref,
  settlementsHref,
  endedCases = [],
}: {
  name: string;
  data: MentorDashboardData;
  cases: CaseListItem[];
  /** 종결·중도 종료된 담당 멘티 — 정산·이력 확인용 (P30) */
  endedCases?: CaseListItem[];
  basePath: string;
  branding: Branding;
  guideHref: string;
  scheduleHref: string;
  settlementsHref: string;
}) {
  const active = data.cases.filter((t) => t.action.key !== 'inactive' && t.action.key !== 'settled');
  const urgent = data.cases.filter((t) => t.action.urgent);
  const unsigned = data.cases.reduce((a, t) => a + t.unsignedRounds, 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{name} 멘토님, 안녕하세요</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            담당 멘티 {active.length}명 · 지금 처리할 일 <b className={urgent.length ? 'text-status-rejected' : ''}>{urgent.length}건</b>
          </p>
        </div>
        <Link href={guideHref} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          <BookOpen className="h-4 w-4" /> 이용 안내 <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* ① 요약 */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Chip icon={Users} label="담당 멘티" value={`${active.length}명`} />
        <Chip icon={FileText} label="보고서 등록 대기" value={`${data.reportPendingCount}건`} tone={data.reportPendingCount ? 'warn' : 'default'} />
        <Chip icon={CalendarDays} label="이번 주 일정" value={`${data.upcoming.length}건`} href={scheduleHref} />
        <Chip icon={Coins} label="예상 지급(세전·미확정)" value={formatKRW(data.estimatedGross)} tone={data.confirmedNet ? 'good' : 'default'} href={settlementsHref} />
      </div>
      {unsigned > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
          멘티 확인 서명이 없는 회차 <b>{unsigned}건</b> — 멘티에게 [회차 확인·서명]을 안내하거나, 케이스의 회차 목록에서 <b>현장 서명 받기</b>로 바로 받을 수 있습니다.
        </p>
      )}

      {/* ② 지금 할 일 */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <ClipboardEdit className="h-4 w-4 text-brand-coral" />
          <h2 className="text-base font-bold">지금 할 일</h2>
          <span className="text-xs text-muted-foreground">멘티마다 다음에 해야 할 한 가지 — 카드를 누르면 그 자리로 이동합니다.</span>
        </div>
        {active.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            아직 배정된 멘티가 없습니다. 운영사가 배정하면 여기에 할 일이 나타납니다.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {active.map((t) => {
              const s = KEY_STYLE[t.action.key];
              return (
                <li key={t.caseId}>
                  <Link href={t.action.href} className="flex gap-3 rounded-xl border-2 bg-background p-3 transition-colors hover:border-primary">
                    <span className={cn('w-1.5 shrink-0 rounded-full', s.bar)} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="truncate font-semibold">{t.label}</span>
                        <span className="text-[11px] text-muted-foreground">{t.groupName ?? ''}</span>
                        <RoundDots done={t.roundsDone} required={t.requiredRounds} />
                      </span>
                      <span className={cn('inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold', s.chip)}>
                        {t.action.urgent && <AlertTriangle className="h-3 w-3" />}
                        {t.action.label}
                        {t.action.key === 'upcoming' && t.nextPlanned ? ` · ${fmtWhen(t.nextPlanned.startedAt)}` : ''}
                      </span>
                      <span className="text-[11px] leading-snug text-muted-foreground">{t.action.hint}</span>
                      {(t.menteePhone || t.menteeEmail) && (
                        <span className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                          {t.menteePhone && (
                            <a href={`tel:${t.menteePhone.replace(/\D/g, '')}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary hover:underline"><Phone className="h-3 w-3" />{t.menteePhone}</a>
                          )}
                          {t.menteePhone && (
                            <a href={`sms:${t.menteePhone.replace(/\D/g, '')}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary hover:underline">문자</a>
                          )}
                          {t.menteeEmail && <a href={`mailto:${t.menteeEmail}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:underline"><Mail className="h-3 w-3" />{t.menteeEmail}</a>}
                          <Link href={`/mentor/qna?tab=messages&case=${t.caseId}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary hover:underline">메시지</Link>
                        </span>
                      )}
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ③ 이번 주 일정 */}
      <section className="flex flex-col gap-2 rounded-xl border-2 bg-background p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold"><CalendarDays className="h-4 w-4 text-primary" /> 이번 주 일정</h2>
          <Link href={scheduleHref} className="text-xs text-primary hover:underline">달력 전체 →</Link>
        </div>
        {data.upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">앞으로 7일 안에 등록된 컨설팅 일정이 없습니다. 케이스에서 [회차 등록]으로 계획을 남기면 여기에 표시됩니다.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {data.upcoming.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="w-32 font-semibold tabular-nums">{fmtWhen(e.startedAt)}</span>
                <Link href={`${basePath}/${e.caseId}`} className="font-medium text-primary hover:underline">{e.label}</Link>
                <span className="text-xs text-muted-foreground">{e.roundNo}회차 · {e.mode === 'online' ? '온라인' : '오프라인'}{e.place ? ` · ${e.place}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ④ 담당 멘티 전체 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">담당 멘티 전체 <span className="text-sm font-normal text-muted-foreground">({cases.length})</span></h2>
        {cases.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">아직 배정된 케이스가 없습니다.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {cases.map((c) => (
              <li key={c.id}>
                <CaseCard item={c} href={`${basePath}/${c.id}`} branding={branding} />
              </li>
            ))}
          </ul>
        )}
        {data.cases.some((t) => t.action.key === 'settled') && (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> 정산이 확정된 케이스의 금액은 <Link href={settlementsHref} className="underline">내 정산 내역</Link>에서 봅니다.</p>
        )}
      </section>

      {endedCases.length > 0 && (
        <details className="rounded-xl border bg-background">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">완료·종료된 멘티 <span className="font-normal text-muted-foreground">({endedCases.length}) — 종결 확정 또는 중도 종료된 케이스</span></summary>
          <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
            {endedCases.map((c) => (
              <li key={c.id} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium">{c.owner_name}{c.business_name && c.business_name !== c.owner_name ? ` / ${c.business_name}` : ''}</p>
                <p className="text-xs text-muted-foreground">{c.supportTypeName ?? '-'} · {c.status === 'closed' ? '종결' : '중도 종료'} · 이행 {c.roundsDone}/{c.requiredRounds}회 · <Link href={settlementsHref} className="underline">정산 내역</Link></p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
