import Link from 'next/link';
import { ClipboardCheck, Inbox, Undo2 } from 'lucide-react';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { hasCapability } from '@/lib/auth/capabilities';
import { listReviewQueue, type ReviewQueueItem } from '@/lib/data/review-queue';
import { SubTabs } from '@/components/common/sub-tabs';
import { EmptyState } from '@/components/common/empty-state';
import { formatDate, formatKRW } from '@/lib/utils/format';
import { menteeLabel } from '@/lib/utils/labels';

export const dynamic = 'force-dynamic';

/** (P31) 운영사 검수 대기열 — 검수 대기 / 보완 요청 중. 오래된 순. 행마다 상태 칩 + 케이스 상세 #review 링크 */
export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const tab = searchParams.tab === 'revision' ? 'revision' : 'pending';
  const queue = await listReviewQueue(ctx.programId, ctx.supportTypeId ?? null);
  const canReview = hasCapability(ctx, 'review');
  const rows = tab === 'pending' ? queue.pending : queue.revision;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">종결 검수</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name}{ctx.group ? ` · ${ctx.group.name}` : ' · 행사 전체'} — 멘토가 종결을 요청한 케이스를 오래된 순으로 보여줍니다. 회차·관찰의견서·서명·만족도 칩을 확인하고 케이스 상세의 검수 패널에서 승인 또는 보완 요청하세요.
          {!canReview && ' (현재 등급은 열람만 가능합니다.)'}
        </p>
      </div>
      <SubTabs
        ariaLabel="검수 대기열"
        active={tab}
        items={[
          { key: 'pending', label: '검수 대기', href: '/nextlab/review?tab=pending', icon: ClipboardCheck, count: queue.pending.length },
          { key: 'revision', label: '보완 요청 중', href: '/nextlab/review?tab=revision', icon: Undo2, count: queue.revision.length },
        ]}
      />
      {rows.length === 0 ? (
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
          <Chip ok={roundsOk} warn={!roundsOk} label={`회차 ${r.reportedRounds}/${r.requiredRounds}`} />
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
