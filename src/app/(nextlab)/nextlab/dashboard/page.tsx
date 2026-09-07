import Link from 'next/link';
import { MessageCircleQuestion } from 'lucide-react';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { fmt } from '@/lib/programs/branding';
import { listCases } from '@/lib/data/cases';
import { countOpenInquiries } from '@/lib/data/inquiries';
import { listOperatorRequests } from '@/lib/data/operator-requests';
import { CaseActionQueue } from '@/components/cases/case-action-queue';
import { CaseStats } from '@/components/cases/case-stats';
import { CaseTable } from '@/components/cases/case-table';
import { OperatorRequestsPanel, OperatorRequestsHeading } from '@/components/nextlab/operator-requests-panel';

export default async function Page() {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const [cases, openInquiries, operatorRequests] = await Promise.all([
    listCases({ programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined }),
    countOpenInquiries(),
    listOperatorRequests(),
  ]);
  const unreadRequests = operatorRequests.filter((r) => !r.read_at).length;
  const b = ctx.branding;

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{fmt('{operator} 대시보드', b)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.group ? ctx.group.name : '행사 전체'} · 멘토 배정 · 종결 검수 · 정산.
        </p>
      </div>

      <CaseStats items={cases} />

      <div className="flex flex-col gap-3">
        <OperatorRequestsHeading unread={unreadRequests} />
        <OperatorRequestsPanel requests={operatorRequests} />
      </div>

      {openInquiries > 0 && (
        <Link
          href="/nextlab/inquiries"
          className="flex items-center justify-between gap-3 rounded-lg border border-status-progress/40 bg-status-progress/10 px-4 py-3 transition-colors hover:bg-status-progress/15"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-status-progress">
            <MessageCircleQuestion className="h-5 w-5" />새 멘티 문의 {openInquiries}건이 접수되었습니다.
          </span>
          <span className="text-sm font-medium text-status-progress underline-offset-4">멘티 문의로 이동 →</span>
        </Link>
      )}

      <CaseActionQueue
        title="멘토 배정 대기"
        description="새로 등록됐거나 멘토 중도 종료로 재배정이 필요한 케이스입니다."
        items={cases.filter((c) => c.status === 'registered' || c.status === 'reassignment_pending')}
        basePath="/nextlab/cases"
        ctaLabel="멘토 배정"
        emptyText="배정 대기 건이 없습니다."
        branding={b}
      />

      <CaseActionQueue
        title="종결 검수 대기"
        description="멘토가 관찰의견서를 제출하고 종결을 요청한 케이스입니다. 검수 승인 시 정산이 확정됩니다. (P4 에서 열립니다)"
        items={cases.filter((c) => c.status === 'closure_requested')}
        basePath="/nextlab/cases"
        ctaLabel="검수"
        emptyText="검수 대기 건이 없습니다."
        branding={b}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">케이스 진행현황</h2>
        <CaseTable items={cases} basePath="/nextlab/cases" branding={b} showGroup={!ctx.group} />
      </div>
    </main>
  );
}
