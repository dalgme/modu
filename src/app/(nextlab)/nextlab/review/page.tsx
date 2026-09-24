import Link from 'next/link';
import { ClipboardCheck, Inbox, PenLine, Undo2 } from 'lucide-react';

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

export const dynamic = 'force-dynamic';

type Tab = 'pending' | 'revision' | 'mentor-input';
const MENTOR_INPUT_HREF = '/nextlab/review?tab=mentor-input';

/** (P32) 멘토 입력 대기 큐에서 "지금 대신 할 일이 있는" 행만 — 보고서 미등록 회차 많은 순 → 멘티 이름순 */
function actionableMentorInput(rows: MentorInputQueueRow[]): MentorInputQueueRow[] {
  return rows
    .filter((r) => r.plannedWithoutReport > 0 || !r.hasObservation || r.pendingSignatures > 0 || r.closureReady)
    .sort((a, b) => b.plannedWithoutReport - a.plannedWithoutReport || a.menteeName.localeCompare(b.menteeName, 'ko'));
}

/**
 * (P31) 운영사 검수 대기열 — 검수 대기 / 보완 요청 중. 오래된 순. 행마다 상태 칩 + 케이스 상세 #review 링크.
 * (P32) 세 번째 탭 [멘토 입력 대기] = listMentorInputQueue — 멘토가 아직 입력하지 않은 회차 보고서·관찰의견서·서명·종결 요청을 대행으로 처리할 케이스.
 */
export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const tab: Tab = searchParams.tab === 'revision' ? 'revision' : searchParams.tab === 'mentor-input' ? 'mentor-input' : 'pending';
  const [queue, mentorInputAll] = await Promise.all([listReviewQueue(ctx.programId, ctx.supportTypeId ?? null), listMentorInputQueue(ctx.programId, ctx.supportTypeId ?? null)]);
  const mentorInput = actionableMentorInput(mentorInputAll);
  const canReview = hasCapability(ctx, 'review');
  const canViewAs = hasCapability(ctx, 'members.view_as');
  const rows = tab === 'pending' ? queue.pending : tab === 'revision' ? queue.revision : [];

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">종결 검수</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name}{ctx.group ? ` · ${ctx.group.name}` : ' · 행사 전체'} — 멘토가 종결을 요청한 케이스를 오래된 순으로 보여줍니다. 회차·관찰의견서·서명·만족도 칩을 확인하고 케이스 상세의 검수 패널에서 승인 또는 보완 요청하세요. [멘토 입력 대기] 탭은 멘토가 아직 등록하지 않은 회차 보고서·관찰의견서·서명·종결 요청을 모아 보여주며, 대행 로그인으로 대신 처리할 수 있습니다.
          {!canReview && ' (현재 등급은 열람만 가능합니다.)'}
        </p>
      </div>
      <SubTabs
        ariaLabel="검수 대기열"
        active={tab}
        items={[
          { key: 'pending', label: '검수 대기', href: '/nextlab/review?tab=pending', icon: ClipboardCheck, count: queue.pending.length },
          { key: 'revision', label: '보완 요청 중', href: '/nextlab/review?tab=revision', icon: Undo2, count: queue.revision.length },
          { key: 'mentor-input', label: '멘토 입력 대기', href: MENTOR_INPUT_HREF, icon: PenLine, count: mentorInput.length },
        ]}
      />
      {tab === 'mentor-input' ? (
        mentorInput.length === 0 ? (
          <EmptyState icon={Inbox} title="멘토 입력을 기다리는 케이스가 없습니다" hint="진행일이 지났는데 보고서가 없는 회차, 관찰의견서 미작성, 멘티 서명 대기, 종결 요청 가능 케이스가 생기면 여기에 나타납니다." />
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
                {mentorInput.map((r) => (
                  <MentorInputRow key={r.caseId} r={r} canViewAs={canViewAs} />
                ))}
              </tbody>
            </table>
          </div>
        )
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
          <Chip ok={r.hasObservation} warn={!r.hasObservation} label={r.hasObservation ? '관찰의견서 있음' : '관찰의견서 없음'} />
          {r.signatures && <Chip ok={r.signatures.signed >= r.signatures.total} warn={r.signatures.signed < r.signatures.total} label={`서명 ${r.signatures.signed}/${r.signatures.total}`} />}
          <Chip ok={r.surveyAnswered} label={r.surveyAnswered ? '만족도 응답' : '만족도 미응답'} />
        </div>
      </td>
      <td className="hidden px-3 py-2 text-right font-semibold tabular-nums md:table-cell">{formatKRW(r.expectedNet)}</td>
      <td className="px-3 py-2 text-right">
        <Link href={`/nextlab/cases/${r.caseId}#review`} className="inline-flex h-8 items-center rounded-md border bg-background px-2.5 text-xs font-semibold hover:bg-accent">
          {canReview ? (r.status === 'closure_requested' ? '검수하기' : '상세 보기') : '상세 보기'}
        </Link>
      </td>
    </tr>
  );
}

/** (P32) 멘토 입력 대기 행 — 보고서 대기·관찰의견서·서명·종결 가능 칩 + 케이스 상세 #rounds 링크 + (권한 시) 멘토 대행 진입 */
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
          {r.pendingSignatures > 0 && <Chip ok={false} warn label={`서명 대기 ${r.pendingSignatures}`} />}
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
