import Link from 'next/link';
import { ClipboardCheck, Inbox, PenLine, RotateCcw, Search, Undo2 } from 'lucide-react';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { hasCapability } from '@/lib/auth/capabilities';
import { listReviewQueue, type ReviewQueueItem } from '@/lib/data/review-queue';
import { listMentorInputQueue, type MentorInputQueueRow } from '@/lib/data/mentor-input-queue';
import { SubTabs } from '@/components/common/sub-tabs';
import { EmptyState } from '@/components/common/empty-state';
import { formatDate, formatKRW } from '@/lib/utils/format';
import { menteeLabel } from '@/lib/utils/labels';
import { MentorName } from '@/components/common/mentor-name';
import { ViewAsStartButton } from '@/components/nextlab/view-as-start-button';
import { listReopenedPartials, type ReopenedPartialRow } from '@/lib/data/reopened-partials';
import { ResettlePartialButton } from '@/components/settlement/cancel-settlement-button';
import { CASE_STATUS_META } from '@/types/case-status';
import type { CaseStatus } from '@/types/case-status';

export const dynamic = 'force-dynamic';

type Tab = 'pending' | 'revision' | 'mentor-input' | 'reopened';
const MENTOR_INPUT_HREF = '/nextlab/review?tab=mentor-input';

/** (P32) 멘토 입력 대기 큐에서 "지금 대신 할 일이 있는" 행만 — 보고서 미등록 회차 많은 순 → 멘티 이름순 */
function actionableMentorInput(rows: MentorInputQueueRow[]): MentorInputQueueRow[] {
  return rows
    .filter((r) => r.plannedWithoutReport > 0 || !r.hasObservation || r.closureReady)
    .sort((a, b) => b.plannedWithoutReport - a.plannedWithoutReport || a.menteeName.localeCompare(b.menteeName, 'ko'));
}

/**
 * (P31) 운영사 검수 대기열 — 검수 대기 / 보완 요청 중. 오래된 순. 행마다 상태 칩 + 케이스 상세 #review 링크.
 * (P32) 세 번째 탭 [멘토 입력 대기] = listMentorInputQueue — 멘토가 아직 입력하지 않은 회차 보고서·관찰의견서·종결 요청을 대행으로 처리할 케이스.
 */
export default async function Page({ searchParams }: { searchParams: { tab?: string; q?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const tab: Tab = searchParams.tab === 'revision' ? 'revision' : searchParams.tab === 'mentor-input' ? 'mentor-input' : searchParams.tab === 'reopened' ? 'reopened' : 'pending';
  const [queue, mentorInputAll, reopened] = await Promise.all([listReviewQueue(ctx.programId, ctx.supportTypeId ?? null), listMentorInputQueue(ctx.programId, ctx.supportTypeId ?? null), listReopenedPartials(ctx.programId, ctx.supportTypeId ?? null)]);
  const canResettle = hasCapability(ctx, 'settlement');
  const mentorInput = actionableMentorInput(mentorInputAll);
  const canReview = hasCapability(ctx, 'review');
  const canViewAs = hasCapability(ctx, 'members.view_as');
  // (2026-11-23) 멘티·멘토 이름 검색 — 공백 무시·대소문자 무시, 멘티 이름·닉네임(소속)·멘토 이름 중 하나라도 포함
  const q = (searchParams.q ?? '').trim().slice(0, 40);
  const qs = q ? `&q=${encodeURIComponent(q)}` : '';
  const hit = (...names: (string | null | undefined)[]) => !q || names.some((n) => !!n && norm(n).includes(norm(q)));
  const pendingRows = queue.pending.filter((r) => hit(r.ownerName, r.businessName, r.mentorName));
  const revisionRows = queue.revision.filter((r) => hit(r.ownerName, r.businessName, r.mentorName));
  const mentorInputRows = mentorInput.filter((r) => hit(r.menteeName, r.businessName, r.mentorName));
  const reopenedRows = reopened.filter((r) => hit(r.menteeName, r.mentorName));
  const rows = tab === 'pending' ? pendingRows : tab === 'revision' ? revisionRows : [];
  const shownCount = tab === 'pending' ? pendingRows.length : tab === 'revision' ? revisionRows.length : tab === 'mentor-input' ? mentorInputRows.length : reopenedRows.length;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">종결 검수</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name}{ctx.group ? ` · ${ctx.group.name}` : ' · 행사 전체'} — 멘토가 종결을 요청한 케이스를 오래된 순으로 보여줍니다. 회차·관찰의견서·만족도 칩을 확인하고 케이스 상세의 검수 패널에서 승인 또는 보완 요청하세요. [멘토 입력 대기] 탭은 멘토가 아직 등록하지 않은 회차 보고서·관찰의견서·서명·종결 요청을 모아 보여주며, 대행 로그인으로 대신 처리할 수 있습니다.
          {!canReview && ' (현재 등급은 열람만 가능합니다.)'}
        </p>
      </div>
      <SubTabs
        ariaLabel="검수 대기열"
        active={tab}
        items={[
          { key: 'pending', label: '검수 대기', href: `/nextlab/review?tab=pending${qs}`, icon: ClipboardCheck, count: pendingRows.length },
          { key: 'revision', label: '보완 요청 중', href: `/nextlab/review?tab=revision${qs}`, icon: Undo2, count: revisionRows.length },
          { key: 'mentor-input', label: '멘토 입력 대기', href: `${MENTOR_INPUT_HREF}${qs}`, icon: PenLine, count: mentorInputRows.length },
          { key: 'reopened', label: '되돌린 부분 정산', href: `/nextlab/review?tab=reopened${qs}`, icon: RotateCcw, count: reopenedRows.length },
        ]}
      />
      <form method="get" action="/nextlab/review" className="flex flex-wrap items-center gap-2" role="search">
        <input type="hidden" name="tab" value={tab} />
        <label className="relative w-full sm:w-72">
          <span className="sr-only">멘티·멘토 이름 검색</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="멘티·멘토 이름 검색"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-base sm:text-sm"
          />
        </label>
        <button type="submit" className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-semibold hover:bg-accent">검색</button>
        {q && (
          <>
            <Link href={`/nextlab/review?tab=${tab}`} className="inline-flex h-9 items-center rounded-md px-2 text-sm text-muted-foreground hover:underline">검색 지우기</Link>
            <span className="text-xs text-muted-foreground">“{q}” 검색 결과 {shownCount}건 (탭 숫자도 검색 결과 기준)</span>
          </>
        )}
      </form>
      {tab === 'reopened' ? (
        <ReopenedPartials rows={reopenedRows} canResettle={canResettle} />
      ) : tab === 'mentor-input' ? (
        mentorInputRows.length === 0 ? (
          <EmptyState icon={Inbox} title="멘토 입력을 기다리는 케이스가 없습니다" hint="진행일이 지났는데 보고서가 없는 회차, 관찰의견서 미작성, 종결 요청 가능 케이스가 생기면 여기에 나타납니다." />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">멘티</th>
                  <th className="hidden px-3 py-2 md:table-cell">그룹</th>
                  <th className="px-3 py-2">멘토</th>
                  <th className="hidden px-3 py-2 md:table-cell">회차</th>
                  <th className="px-3 py-2">대기 항목</th>
                  <th className="px-3 py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {mentorInputRows.map((r) => (
                  <MentorInputRow key={r.caseId} r={r} canViewAs={canViewAs} />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : rows.length === 0 && q ? (
        <EmptyState icon={Search} title={`“${q}” 검색 결과가 없습니다`} hint="멘티 이름·닉네임 또는 멘토 이름 일부로 다시 검색해 보세요. 다른 탭에 있을 수도 있습니다." />
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title={tab === 'pending' ? '검수 대기 케이스가 없습니다' : '보완 요청 중인 케이스가 없습니다'} hint={tab === 'pending' ? '멘토가 관찰의견서를 제출하고 종결을 요청하면 여기에 나타납니다.' : '보완을 요청한 케이스는 멘토가 수정 후 다시 종결을 요청할 때까지 여기에 남습니다.'} />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">멘티</th>
                <th className="hidden px-3 py-2 md:table-cell">그룹 · 멘토</th>
                <th className="px-3 py-2">대기</th>
                <th className="px-3 py-2">확인 항목</th>
                <th className="hidden px-3 py-2 text-right md:table-cell">예상 실지급</th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.caseId} r={r} canReview={canReview} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

/** 검색 비교용 — 공백 제거·소문자 */
function norm(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

function Chip({ ok, label, warn = false }: { ok: boolean; label: string; warn?: boolean }) {
  const cls = ok ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200' : warn ? 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100' : 'border-muted bg-muted/40 text-muted-foreground';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

function Row({ r, canReview }: { r: ReviewQueueItem; canReview: boolean }) {
  const roundsOk = r.reportedRounds >= r.requiredRounds && r.requiredRounds > 0;
  const overdue = r.waitingDays >= 3;
  return (
    <tr className={`border-b align-top last:border-0 ${overdue && r.status === 'closure_requested' ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
      <td className="px-3 py-2">
        <Link href={`/nextlab/cases/${r.caseId}#review`} className="font-medium hover:underline">{menteeLabel(r.ownerName, r.businessName)}</Link>
        <p className="text-xs text-muted-foreground md:hidden">{r.groupName}{r.mentorName ? ` · ${r.mentorName}` : ''}</p>
        {r.revisionComment && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">보완 사유: {r.revisionComment}</p>}
      </td>
      <td className="hidden px-3 py-2 text-xs md:table-cell">{r.groupName}<br />{r.mentorName ?? <span className="text-muted-foreground">멘토 없음</span>}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">
        <b className={overdue ? 'text-amber-700' : ''}>{r.waitingDays}일</b>
        <br /><span className="text-muted-foreground">{formatDate(r.enteredAt)}</span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          <Chip ok={roundsOk} warn={!roundsOk} label={`회차 ${r.reportedRounds}/${r.requiredRounds}${r.extraRounds ? ` (+추가 ${r.extraRounds})` : ''}`} />
          {r.earlyClosure && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">중도 종결 · 진행 회차까지 정산</span>}
          {r.observationRequired ? <Chip ok={r.hasObservation} warn={!r.hasObservation} label={r.hasObservation ? '관찰의견서 있음' : '관찰의견서 없음'} /> : <Chip ok warn={false} label="관찰의견서 불필요 그룹" />}
          <Chip ok={r.surveyAnswered} label={r.surveyAnswered ? '만족도 응답' : '만족도 미응답'} />
          {r.status === 'ready' && <Chip ok warn={false} label="서류 완비 · 종결 요청 전" />}
        </div>
      </td>
      <td className="hidden px-3 py-2 text-right font-semibold tabular-nums md:table-cell">
        {formatKRW(r.expectedNet)}
        {r.settledCount > 0 && <span className="block text-[11px] font-normal text-sky-700 dark:text-sky-300">이미 정산 {formatKRW(r.settledNet)}{r.settledCount > 1 ? ` (${r.settledCount}건)` : ''}</span>}
      </td>
      <td className="px-3 py-2 text-right">
        <Link href={`/nextlab/cases/${r.caseId}#review`} className="inline-flex h-8 items-center rounded-md border bg-background px-2.5 text-xs font-semibold hover:bg-accent">
          {canReview ? (r.status === 'revision_requested' ? '상세 보기' : '검수하기') : '상세 보기'}
        </Link>
      </td>
    </tr>
  );
}

/** (P32) 멘토 입력 대기 행 — 보고서 대기·관찰의견서·종결 가능 칩 + 케이스 상세 #rounds 링크 + (권한 시) 멘토 대행 진입 */
function MentorInputRow({ r, canViewAs }: { r: MentorInputQueueRow; canViewAs: boolean }) {
  const roundsOk = r.requiredRounds > 0 && r.reportedRounds >= r.requiredRounds;
  return (
    <tr className={`border-b align-top last:border-0 ${r.plannedWithoutReport > 0 ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
      <td className="px-3 py-2">
        <Link href={`/nextlab/cases/${r.caseId}#rounds`} className="font-medium hover:underline">{menteeLabel(r.menteeName, r.businessName)}</Link>
        <p className="text-xs text-muted-foreground md:hidden">{r.groupName} · 회차 {r.reportedRounds}/{r.requiredRounds}</p>
      </td>
      <td className="hidden px-3 py-2 text-xs md:table-cell">{r.groupName}</td>
      <td className="px-3 py-2 text-xs">
        {r.mentorId && r.mentorName ? <MentorName id={r.mentorId} name={r.mentorName} /> : <span className="text-muted-foreground">멘토 없음</span>}
      </td>
      <td className={`hidden whitespace-nowrap px-3 py-2 text-xs tabular-nums md:table-cell ${roundsOk ? 'text-emerald-700' : ''}`}>{r.reportedRounds}/{r.requiredRounds}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {r.plannedWithoutReport > 0 && <Chip ok={false} warn label={`보고서 대기 ${r.plannedWithoutReport}회차`} />}
          {!r.hasObservation && <Chip ok={false} warn={roundsOk} label="관찰의견서 없음" />}
          {r.closureReady && <Chip ok label="종결 요청 가능" />}
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
          <Link href={`/nextlab/cases/${r.caseId}#rounds`} className="inline-flex h-8 items-center rounded-md border bg-background px-2.5 text-xs font-semibold hover:bg-accent">
            케이스 보기
          </Link>
          {canViewAs && r.mentorId && r.mentorName && (
            <ViewAsStartButton targetUserId={r.mentorId} targetName={r.mentorName} caseId={r.caseId} returnTo={MENTOR_INPUT_HREF} label="멘토 대행으로 열기" size="sm" variant="outline" />
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * (2026-11-16) [검수로 되돌리기]한 부분 정산(멘토·멘티 중도 종료) — 케이스는 재배정 대기·중도 종료 그대로라 검수 대기에 나오지 않는다.
 * 회차를 정정한 뒤 [부분 정산 다시 확정]을 누르면 새 품의가 자동 작성·제출되고 이 목록에서 빠진다.
 */
function ReopenedPartials({ rows, canResettle }: { rows: ReopenedPartialRow[]; canResettle: boolean }) {
  if (rows.length === 0) {
    return <EmptyState icon={Inbox} title="되돌린 부분 정산이 없습니다" hint="정산·품의 화면에서 중도 종료(부분) 정산을 [검수로 되돌리기] 하면 회차 정정 후 다시 확정할 때까지 여기에 남습니다." />;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100">
        중도 종료(부분) 정산은 케이스가 검수 단계로 가지 않고 여기 모입니다. ① [회차 정정]에서 일정 시간을 보고서와 맞게 고치고(케이스 화면 회차 목록의 [정정]) ② [부분 정산 다시 확정]을 누르면 새 지급 품의가 자동으로 작성·제출됩니다.
      </p>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">멘티</th>
              <th className="px-3 py-2">멘토</th>
              <th className="hidden px-3 py-2 md:table-cell">되돌린 사유</th>
              <th className="px-3 py-2">회차</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.caseId}|${r.mentorId}`} className="border-b align-top last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/nextlab/cases/${r.caseId}#rounds`} className="font-medium hover:underline">{r.menteeName}</Link>
                  <p className="text-xs text-muted-foreground">{r.groupName ?? '-'} · {CASE_STATUS_META[r.caseStatus as CaseStatus]?.short ?? r.caseStatus}</p>
                </td>
                <td className="px-3 py-2 text-xs"><MentorName id={r.mentorId} name={r.mentorName} /></td>
                <td className="hidden px-3 py-2 text-xs md:table-cell">
                  {r.reason || '-'}
                  <br /><span className="text-muted-foreground">{formatDate(r.canceledAt)}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  미정산 {r.unsettledRounds}회차
                  {r.corrected > 0 && <><br /><span className="text-emerald-700">정정 {r.corrected}건</span></>}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                    <Link href={`/nextlab/cases/${r.caseId}#rounds`} className="inline-flex h-8 items-center rounded-md border bg-background px-2.5 text-xs font-semibold hover:bg-accent">
                      회차 정정
                    </Link>
                    {canResettle && <ResettlePartialButton caseId={r.caseId} mentorId={r.mentorId} mentorName={r.mentorName} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
