import Link from 'next/link';
import { AlertTriangle, ArrowRight, BookOpen, CalendarDays, CheckCircle2, ClipboardEdit, Coins, FileText, Users } from 'lucide-react';

import type { MentorDashboardData, MentorActionKey } from '@/lib/data/role-dashboard';
import type { CaseListItem } from '@/lib/data/cases';
import type { Branding } from '@/lib/programs/branding';
import { StatusBadge } from '@/components/cases/status-badge';
import { ProcessStepBar } from '@/components/cases/process-step-bar';
import { RoundDots } from '@/components/common/round-dots';
import { MenteeContactLinks } from '@/components/mentor/mentee-contact-links';
import { formatKRW } from '@/lib/utils/format';
import { kstWhen } from '@/lib/utils/kst';
import { cn } from '@/lib/utils';

/**
 * 멘토 대시보드 v2 (P28) — "지금 할 일" 우선.
 * ① 요약 칩(담당 멘티·보고서 등록 현황·이번 주 일정·예상 지급) ② 담당 멘티 · 지금 할 일(멘티 전원, 긴급 순, 진행 막대·회차 포함)
 * ③ 이번 주 일정 ④ 완료·종료된 멘티(접기). 옛 '담당 멘티 전체' 목록은 ②에 병합됐다.
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

// KST 고정 (P35-D) — 서버(UTC) 렌더에서도 한국 시각 'M/D(요일) HH:mm'
const fmtWhen = (iso: string) => kstWhen(iso) || '-';

function Chip({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'default',
  href,
  title,
  wrap = false,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  /** 값 아래 보조 한 줄 (예: 진행 후 미등록 n건) */
  sub?: string;
  tone?: 'default' | 'warn' | 'good';
  href?: string;
  title?: string;
  /** 값이 길면 줄바꿈 허용 (기본은 한 줄 말줄임) */
  wrap?: boolean;
}) {
  const cls = cn(
    'flex items-center gap-2.5 rounded-xl border-2 bg-background px-3 py-2.5',
    tone === 'warn' && 'border-status-rejected/50 bg-status-rejected/5',
    tone === 'good' && 'border-emerald-300 bg-emerald-50/50',
  );
  // 카드 전체가 하나의 링크 — 안에 다른 <a> 를 두지 않는다 (중첩 앵커 = 하이드레이션 오류 #418)
  const inner = (
    <>
      <Icon className={cn('h-5 w-5 shrink-0', tone === 'warn' ? 'text-status-rejected' : tone === 'good' ? 'text-emerald-600' : 'text-primary')} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className={cn('text-base font-bold tabular-nums', wrap ? 'break-keep text-sm sm:text-base' : 'truncate')}>{value}</span>
        {sub && <span className={cn('text-[11px]', tone === 'warn' ? 'text-status-rejected' : 'text-muted-foreground')}>{sub}</span>}
      </span>
      {href && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
    </>
  );
  return href ? (
    <Link href={href} title={title} className={cn(cls, 'transition-colors hover:border-primary hover:bg-accent/40')}>
      {inner}
    </Link>
  ) : (
    <div title={title} className={cls}>
      {inner}
    </div>
  );
}

export function MentorDashboardV2({
  name,
  data,
  basePath,
  branding,
  guideHref,
  scheduleHref,
  settlementsHref,
  endedCases = [],
}: {
  name: string;
  data: MentorDashboardData;
  /** (호환용 — 더 이상 쓰지 않음) 담당 멘티 목록은 data.cases 의 할 일 카드로 통합됐다 */
  cases?: CaseListItem[];
  /** 종결·중도 종료된 담당 멘티 — 정산·이력 확인용 (P30) */
  endedCases?: CaseListItem[];
  basePath: string;
  branding: Branding;
  guideHref: string;
  scheduleHref: string;
  settlementsHref: string;
}) {
  // 진행 중 담당 멘티 — 운영사 처리 중(inactive)·정산 확정 이후(settled) 제외. 보고서 등록 현황도 같은 집합(role-dashboard reportSummary)
  const active = data.cases.filter((t) => t.action.key !== 'inactive' && t.action.key !== 'settled');
  const urgent = data.cases.filter((t) => t.action.urgent);
  const unsigned = data.cases.reduce((a, t) => a + t.unsignedRounds, 0);
  const caseHref = (caseId: string) => `${basePath}/${caseId}`;
  // (A) 담당 멘티 카드: 1명이면 그 멘티 화면으로 바로, 여러 명이면 아래 '담당 멘티 · 지금 할 일' 목록으로
  const menteeHref = active.length === 1 ? caseHref(active[0]!.caseId) : data.cases.length > 0 ? '#todo' : undefined;
  // (B) 보고서 등록 현황 카드: 보고서가 밀린 첫 멘티의 회차 목록으로, 없으면 목록으로
  const firstReport = data.cases.find((t) => t.action.key === 'report');
  const reportHref = firstReport ? firstReport.action.href : data.cases.length > 0 ? '#todo' : undefined;
  const rs = data.reportSummary;
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

      {/* ① 요약 — 보고서 등록 현황 카드는 문구가 길어 30% 넓게(1.3), 나머지 3장은 같은 폭(0.9)으로 줄여 한 줄 합계를 유지 */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[9fr_13fr_9fr_9fr]">
        <Chip
          icon={Users}
          label="담당 멘티"
          value={`${active.length}명`}
          href={menteeHref}
          title={active.length === 1 ? '담당 멘티 화면으로 이동' : '담당 멘티 목록으로 이동'}
        />
        <Chip
          icon={FileText}
          label="보고서 등록 현황"
          value={`총회차 : ${rs.totalRounds}회, 등록건수 : ${rs.registered}건`}
          sub={data.reportPendingCount > 0 ? `진행 후 보고서 미등록 ${data.reportPendingCount}건` : undefined}
          tone={data.reportPendingCount ? 'warn' : 'default'}
          href={reportHref}
          title="진행 중 담당 멘티 기준 — 총회차 = 필수 회차 + 승인된 추가 회차 합계, 등록건수 = 보고서까지 등록된 회차(멘티별 누적, 멘토 변경 전 회차 포함)"
          wrap
        />
        <Chip icon={CalendarDays} label="이번 주 일정" value={`${data.upcoming.length}건`} href={scheduleHref} />
        <Chip icon={Coins} label="예상 지급(세전·미확정)" value={formatKRW(data.estimatedGross)} tone={data.confirmedNet ? 'good' : 'default'} href={settlementsHref} />
      </div>
      {unsigned > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
          멘티 확인 서명이 없는 회차 <b>{unsigned}건</b> — 멘티에게 [회차 확인·서명]을 안내하거나, 케이스의 회차 목록에서 <b>현장 서명 받기</b>로 바로 받을 수 있습니다.
        </p>
      )}

      {/* ② 담당 멘티 · 지금 할 일 — 옛 '지금 할 일' + '담당 멘티 전체' 병합. 담당 멘티 전원을 긴급 순으로 (정렬은 role-dashboard ORDER) */}
      <section id="todo" className="flex scroll-mt-24 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <ClipboardEdit className="h-4 w-4 text-brand-coral" />
          <h2 className="text-base font-bold">
            담당 멘티 · 지금 할 일 <span className="text-sm font-normal text-muted-foreground">({data.cases.length})</span>
          </h2>
          <span className="text-xs text-muted-foreground">멘티마다 다음에 해야 할 한 가지 — 카드를 누르면 그 멘티 화면의 해당 위치로 이동합니다.</span>
        </div>
        {data.cases.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            아직 배정된 멘티가 없습니다. 운영사가 배정하면 여기에 할 일이 나타납니다.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {data.cases.map((t) => {
              const s = KEY_STYLE[t.action.key];
              return (
                <li key={t.caseId}>
                  {/* 카드 전체를 <a> 로 감싸면 안에 있는 연락 링크(<a tel:/sms:/mailto:>)가 중첩 앵커가 되어 브라우저가 DOM 을 쪼개고
                      React 하이드레이션 오류(#418)가 난다(2026-09-28 스모크 12건). 링크 영역과 연락 링크를 형제로 둔다. */}
                  {/* (2026-09-30) 가독성 카드: 머리(멘티명·그룹·단계) → 지금 할 일 강조 상자 → 진행 현황 → 연락처·바로가기 */}
                  <div className={cn('flex h-full flex-col overflow-hidden rounded-2xl border bg-background shadow-sm transition-shadow hover:shadow-md', t.action.key === 'inactive' && 'opacity-70')}>
                    <span className={cn('h-1.5 w-full', s.bar)} aria-hidden />
                    <Link href={t.action.href} className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-lg font-bold leading-tight">{t.label}</p>
                          {t.groupName && <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t.groupName}</span>}
                        </div>
                        <StatusBadge status={t.status} branding={branding} short className="shrink-0" />
                      </div>
                      <div className={cn('flex flex-col gap-1 rounded-xl px-3 py-2.5', s.chip)}>
                        <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                          {t.action.urgent && <AlertTriangle className="h-4 w-4" />}
                          지금 할 일 · {t.action.label}
                          {t.action.key === 'upcoming' && t.nextPlanned ? ` · ${fmtWhen(t.nextPlanned.startedAt)}` : ''}
                        </span>
                        <span className="text-xs leading-snug opacity-90">{t.action.hint}</span>
                      </div>
                      {/* 진행 표시 — 단계 막대 + 회차 ①②③④ (이행 = 보고서 등록 기준) */}
                      <div className="flex flex-col gap-2 rounded-xl border border-dashed px-3 py-2.5">
                        <ProcessStepBar status={t.status} compact />
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <RoundDots done={t.roundsDone} required={t.requiredRounds} />
                          <span className="tabular-nums">
                            보고서 <b className="text-base text-foreground">{t.roundsDone}</b>
                            <span className="text-muted-foreground"> / {t.requiredRounds}회{t.extraRounds > 0 ? ` (추가 ${t.extraRounds}회 승인)` : ''}</span>
                          </span>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 self-end text-xs font-semibold text-primary">
                        멘티 화면으로 <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </Link>
                    {(t.menteePhone || t.menteeEmail) && (
                      <div className="border-t bg-muted/30 px-4 py-2">
                        <MenteeContactLinks phone={t.menteePhone} email={t.menteeEmail} caseId={t.caseId} />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {data.cases.some((t) => t.action.key === 'settled') && (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> 정산이 확정된 케이스의 금액은{' '}
            <Link href={settlementsHref} className="underline">내 정산 내역</Link>에서 봅니다.
          </p>
        )}
      </section>

      {/* ③ 이번 주 일정 */}
      <section className="flex flex-col gap-2 rounded-xl border-2 bg-background p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold"><CalendarDays className="h-4 w-4 text-primary" /> 이번 주 일정</h2>
          <Link href={scheduleHref} className="text-xs text-primary hover:underline">달력 전체 →</Link>
        </div>
        {data.upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">앞으로 7일 안에 등록된 컨설팅 일정이 없습니다. 멘티 화면의 [N차 예정 등록]으로 일정을 남기면 여기에 표시됩니다.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {data.upcoming.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="w-32 font-semibold tabular-nums">{fmtWhen(e.startedAt)}</span>
                <Link href={caseHref(e.caseId)} className="font-medium text-primary hover:underline">{e.label}</Link>
                <span className="text-xs text-muted-foreground">{e.roundNo}회차 · {e.mode === 'online' ? '온라인' : '오프라인'}{e.place ? ` · ${e.place}` : ''}</span>
              </li>
            ))}
          </ul>
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
