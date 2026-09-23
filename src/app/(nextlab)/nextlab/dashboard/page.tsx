import Link from 'next/link';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { fmt } from '@/lib/programs/branding';
import { createAdminClient } from '@/lib/supabase/admin';
import { listCases } from '@/lib/data/cases';
import { countOpenInquiries } from '@/lib/data/inquiries';
import { listBoardPosts } from '@/lib/data/board';
import { listProgramMessages } from '@/lib/messages/data';
import { listOperatorRequests } from '@/lib/data/operator-requests';
import { listInbox } from '@/lib/data/requests';
import { computeProgramMetrics } from '@/lib/reports/metrics';
import { computeBudgetOverview } from '@/lib/reports/budget';
import { computeMonthlyTrend } from '@/lib/reports/trend';
import { listDelayedCases } from '@/lib/reports/delays';
import { CASE_STATUS_META } from '@/types/case-status';
import { menteeLabel } from '@/lib/utils/labels';
import { DashboardV2, type DashboardQueueCase } from '@/components/nextlab/dashboard-v2';
import { OperatorRequestsPanel, OperatorRequestsHeading } from '@/components/nextlab/operator-requests-panel';

export const dynamic = 'force-dynamic';

/** 운영사 대시보드 (P27-21 재구조화) — 지금 확인 · 핵심 지표 · 차트 · 예산 · 바로가기 · 발주처 요청 */
export default async function Page() {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const groupId = ctx.supportTypeId ?? null;
  const [cases, openInquiries, operatorRequests, inbox, metrics, boardPosts, programMessages, budget, trend, delays] = await Promise.all([
    listCases({ programId: ctx.programId, supportTypeId: groupId ?? undefined }),
    countOpenInquiries(),
    listOperatorRequests(),
    listInbox(ctx.programId, groupId ?? undefined, true),
    computeProgramMetrics(ctx.programId, groupId),
    listBoardPosts(),
    listProgramMessages(ctx.programId),
    computeBudgetOverview(ctx.programId, groupId),
    computeMonthlyTrend(ctx.programId, groupId),
    listDelayedCases(ctx.programId, groupId),
  ]);
  // 멘토가 아직 확인하지 않은 배정 (범위 내 케이스)
  const caseIds = cases.map((c) => c.id);
  const { count: unconfirmed } = caseIds.length
    ? await createAdminClient().from('mentor_assignments').select('id', { count: 'exact', head: true }).eq('is_active', true).is('confirmed_at', null).in('case_id', caseIds)
    : { count: 0 };
  const toQueue = (c: (typeof cases)[number]): DashboardQueueCase => ({
    caseId: c.id,
    label: menteeLabel(c.owner_name, c.business_name),
    groupName: c.supportTypeName,
    statusLabel: CASE_STATUS_META[c.status].short,
    mentorName: c.mentorName,
    roundsDone: c.roundsDone,
    requiredRounds: c.requiredRounds,
    createdAt: c.created_at,
  });
  const unreadRequests = operatorRequests.filter((r) => !r.read_at).length;
  const b = ctx.branding;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{fmt('{operator} 대시보드', b)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <b>{ctx.program.name}</b> · {ctx.group ? ctx.group.name : '행사 전체'} — 배정 · 회차 · 검수 · 정산의 현재 상태와 오늘 처리할 일.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/nextlab/roster" className="rounded-lg border bg-background px-3 py-2 text-sm font-semibold hover:bg-accent">회원 명단</Link>
          <Link href="/nextlab/reports" className="rounded-lg border bg-background px-3 py-2 text-sm font-semibold hover:bg-accent">리포트</Link>
        </div>
      </div>

      <DashboardV2
        scopeLabel={ctx.group ? ctx.group.name : '행사 전체'}
        metrics={metrics}
        budget={budget}
        trend={trend}
        delays={delays}
        inbox={inbox}
        assignQueue={cases.filter((c) => c.status === 'registered' || c.status === 'reassignment_pending').map(toQueue)}
        closureQueue={cases.filter((c) => c.status === 'closure_requested').map(toQueue)}
        board={{ inquiries: openInquiries, posts: boardPosts.filter((p) => p.replies.length === 0).length, messages: programMessages.filter((m) => !m.read).length }}
        unconfirmedAssignments={unconfirmed ?? 0}
        operatorRequestsUnread={unreadRequests}
      />

      <div className="flex flex-col gap-3">
        <OperatorRequestsHeading unread={unreadRequests} />
        <OperatorRequestsPanel requests={operatorRequests} />
      </div>
    </main>
  );
}
