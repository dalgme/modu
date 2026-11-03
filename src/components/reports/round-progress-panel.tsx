import Link from 'next/link';

import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { kstYmd, kstHm } from '@/lib/utils/kst';
import { cn } from '@/lib/utils';
import { ROUND_PROGRESS_CATEGORY_LABELS, type RoundProgressCategory, type RoundProgressResult, type RoundRow } from '@/lib/reports/round-progress-shared';

/**
 * 리포트 [회차별 현황] 탭 (2026-11-03) — 회차마다 일정 등록·진행 완료·보고서 등록과 종료·포기 구분.
 * 서버 컴포넌트(훅 없음). 수치는 computeRoundProgress 한 곳에서 — 엑셀과 같다.
 */
export function RoundProgressPanel({ data, base, generatedAt }: { data: RoundProgressResult; base: '/nextlab' | '/institution'; generatedAt: string }) {
  const s = data.summary;
  const groupName = new Map(data.groups.map((g) => [g.id, g.name]));
  const byCat = (cat: RoundProgressCategory) => data.cases.filter((c) => c.category === cat).sort((a, b) => a.menteeName.localeCompare(b.menteeName, 'ko'));
  const multiGroup = data.groups.length > 1;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        기준 {kstYmd(generatedAt)} {kstHm(generatedAt)} — <b>진행 완료</b> = 회차 종료 시각이 지금 이전. <b>종료·포기 구분</b> = 회원 명단 &gt; 멘티 &gt; [정보 수정]에서 운영사가 지정한 [멘토링 포기]·[멘토링 종료]가 우선이고, 지정이 없으면 검수 승인 이후 = 종료, 중도 종료·회원 비활성화(행사 비활성화·계정 잠금) = 포기로 추정합니다 — 이 탭은 다른 탭과 달리 비활성 멘티도 셉니다. 멘티 수는 라운드 등록(케이스) 기준입니다.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="전체 멘티" value={s.total} sub={`진행 중 ${s.ongoing} (멘토 미배정 ${s.ongoingUnassigned})`} />
        <Card label="진행 멘티" value={s.participatingMentees} sub="회차 진행 안 하고 포기한 멘티 제외" tone="blue" />
        <Card label="진행 멘토" value={s.participatingMentors} sub={`지금 진행 중인 멘티 담당 ${s.currentMentors}명`} tone="blue" />
        <div className="rounded-xl border bg-background p-4">
          <div className="text-xs font-semibold text-muted-foreground">멘토링 최종 종료</div>
          <dl className="mt-2 flex flex-col gap-1 text-sm">
            <Line label={ROUND_PROGRESS_CATEGORY_LABELS.ended} value={s.ended} cls="text-emerald-700 dark:text-emerald-300" />
            <Line label={ROUND_PROGRESS_CATEGORY_LABELS.gaveUpAfter} value={s.gaveUpAfter} cls="text-amber-700 dark:text-amber-300" />
            <Line label={ROUND_PROGRESS_CATEGORY_LABELS.gaveUpBefore} value={s.gaveUpBefore} cls="text-rose-700 dark:text-rose-300" />
          </dl>
        </div>
      </div>

      {data.groups.map((g) => (
        <section key={g.id} className="flex flex-col gap-2 rounded-xl border bg-background p-4">
          <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-base font-bold">
            {g.name}
            <span className="text-xs font-normal text-muted-foreground">
              멘토링 {g.requiredRounds}회 · 멘티 {g.summary.total}명 (진행 중 {g.summary.ongoing} · 종료 {g.summary.ended} · 진행 후 포기 {g.summary.gaveUpAfter} · 진행 안 하고 포기 {g.summary.gaveUpBefore}) · 진행 멘토 {g.summary.participatingMentors}명
            </span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left">회차</th>
                  <th className="px-2 py-2 text-right">일정 등록</th>
                  <th className="px-2 py-2 text-right">일정 미등록</th>
                  <th className="px-2 py-2 text-right">진행 완료</th>
                  <th className="px-2 py-2 text-right">진행 미완료</th>
                  <th className="px-2 py-2 text-right">보고서 등록</th>
                  <th className="px-2 py-2 text-right">보고서 대기</th>
                  <th className="px-2 py-2 text-right" title="종료·포기한 멘티 중 이 회차 일정이 없는 수 (진행 완료 기준이 다르면 괄호)">제외(종료·포기)</th>
                </tr>
              </thead>
              <tbody>
                {g.rounds.map((r) => (
                  <RoundTr key={r.roundNo} r={r} />
                ))}
                {g.rounds.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">회차 정보가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        일정 등록 + 일정 미등록 + 제외 = 전체 멘티 · 진행 완료 + 진행 미완료 + 제외 = 전체 멘티. 진행 미완료 괄호 = 그중 일정은 등록된(예정) 수. 보고서 대기 = 진행 완료됐는데 보고서가 아직 없는 수.
      </p>

      <div className="grid gap-3 lg:grid-cols-3">
        {(['ended', 'gaveUpAfter', 'gaveUpBefore'] as const).map((cat) => {
          const list = byCat(cat);
          return (
            <details key={cat} className="rounded-xl border bg-background p-3 text-sm">
              <summary className="cursor-pointer font-semibold">
                {ROUND_PROGRESS_CATEGORY_LABELS[cat]} 명단 {list.length}명
              </summary>
              {list.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">없음</p>
              ) : (
                <ul className="mt-2 flex max-h-80 flex-col gap-1 overflow-y-auto">
                  {list.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
                      <Link href={`${base}/cases/${c.id}`} className="truncate font-medium hover:underline">
                        {c.menteeName}
                        {multiGroup && <span className="ml-1 text-xs font-normal text-muted-foreground">{groupName.get(c.groupId) ?? ''}</span>}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        완료 {c.completedRounds}회 · {c.outcome ? '운영사 지정' : c.status === 'withdrawn' ? '중도 종료' : c.inactive && cat !== 'ended' ? '비활성화' : (CASE_STATUS_META[c.status as CaseStatus]?.short ?? c.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}

function RoundTr({ r }: { r: RoundRow }) {
  const dash = <span className="text-muted-foreground">-</span>;
  return (
    <tr className="border-b last:border-0">
      <td className="px-2 py-2 font-semibold">
        {r.roundNo}회차{r.extra && <span className="ml-1 text-xs font-normal text-muted-foreground">(추가)</span>}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{r.registered}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums', (r.unregistered ?? 0) > 0 && 'font-semibold text-rose-700 dark:text-rose-300')}>{r.unregistered ?? dash}</td>
      <td className="px-2 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{r.completed}</td>
      <td className="px-2 py-2 text-right tabular-nums">
        {r.notCompleted ?? dash}
        {r.notCompleted !== null && r.notCompletedScheduled ? <span className="ml-1 text-xs text-muted-foreground">(예정 {r.notCompletedScheduled})</span> : null}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{r.reports}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums', r.reportPending > 0 && 'font-semibold text-amber-700 dark:text-amber-300')}>{r.reportPending}</td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
        {r.excludedRegistration}
        {r.excludedCompletion !== r.excludedRegistration && <span className="ml-1 text-xs">({r.excludedCompletion})</span>}
      </td>
    </tr>
  );
}

function Card({ label, value, sub, tone }: { label: string; value: number; sub: string; tone?: 'blue' }) {
  return (
    <div className={cn('rounded-xl border bg-background p-4', tone === 'blue' && 'border-sky-300 dark:border-sky-800')}>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString('ko-KR')}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function Line({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt>{label}</dt>
      <dd className={cn('font-bold tabular-nums', cls)}>{value}</dd>
    </div>
  );
}
