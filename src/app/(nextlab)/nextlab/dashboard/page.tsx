import Link from 'next/link';

import { MessageCircleQuestion, RotateCcw, FilePenLine } from 'lucide-react';

import { computeCaseStats } from '@/lib/data/stats';
import { listCases, listRecalledCases } from '@/lib/data/cases';
import { countOpenInquiries } from '@/lib/data/inquiries';
import { listOperatorRequests } from '@/lib/data/operator-requests';
import { StatsChartsLazy as StatsCharts } from '@/components/admin/stats-charts-lazy';
import { StaffCasesView, type StaffCasesSearchParams } from '@/components/cases/staff-cases-view';
import { CaseActionQueue } from '@/components/cases/case-action-queue';
import {
  OperatorRequestsPanel,
  OperatorRequestsHeading,
} from '@/components/nextlab/operator-requests-panel';
import { Button } from '@/components/ui/button';

export default async function Page({ searchParams }: { searchParams: StaffCasesSearchParams }) {
  const [cases, openInquiries, operatorRequests, recalled] = await Promise.all([
    listCases({}),
    countOpenInquiries(),
    listOperatorRequests(),
    listRecalledCases(),
  ]);
  const stats = computeCaseStats(cases);
  const unreadRequests = operatorRequests.filter((r) => !r.read_at).length;
  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">넥스트랩 대시보드</h1>
        <p className="mt-1 text-sm text-muted-foreground">멘토 배정 · 서류 검수 · 지급신청 관리.</p>
      </div>

      {recalled.length > 0 && (
        <section className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/30">
          <div className="flex flex-wrap items-center gap-2">
            <RotateCcw className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            <h2 className="text-base font-semibold text-rose-800 dark:text-rose-300">
              회수 및 재등록 필요 기업
            </h2>
            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
              {recalled.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">
            멘토 배정이 회수된 기업입니다. 클릭해 신청서 PDF를 다시 업로드하고 내용을 확인·보완해
            재등록(멘토 배정 요청)하세요.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {recalled.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-background px-3 py-2 dark:border-rose-900"
              >
                <div className="min-w-0">
                  <span className="font-semibold">{c.business_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    대표 {c.owner_name} · {c.supportTypeName ?? '-'}
                  </span>
                </div>
                <Button asChild size="sm" className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700">
                  <Link href={`/nextlab/cases/${c.id}/edit`}>
                    <FilePenLine className="h-3.5 w-3.5" />
                    재등록 진행
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 운영사(진흥원) 요청 — 첫 화면 리스트업, 신규 강조 */}
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
            <MessageCircleQuestion className="h-5 w-5" />새 멘티 문의 {openInquiries}건이
            접수되었습니다.
          </span>
          <span className="text-sm font-medium text-status-progress underline-offset-4">
            멘티 문의로 이동 →
          </span>
        </Link>
      )}

      <CaseActionQueue
        title="신규 신청 · 멘토 배정 대기"
        description="진흥원에서 접수된 신규 케이스입니다. 지체 없이 멘토를 배정해 멘토에게 넘기세요."
        items={cases.filter((c) => c.status === 'registered')}
        basePath="/nextlab/cases"
        ctaLabel="멘토 배정"
        secondaryCta={{ label: '접수내용 확인', hrefSuffix: 'intake' }}
        emptyText="대기 중인 신규 신청이 없습니다."
      />

      <CaseActionQueue
        title="검수 · 지급신청 대기"
        description="지원신청서 검수, 시공증빙 확인 후 지급신청서 작성이 필요한 케이스입니다."
        items={cases.filter(
          (c) => c.status === 'under_review' || c.status === 'execution_docs_submitted',
        )}
        basePath="/nextlab/cases"
        ctaLabel="처리하기"
        emptyText="처리 대기 건이 없습니다."
      />

      <StatsCharts stats={stats} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">케이스 조회 · 진행현황</h2>
          <Button asChild variant="outline" size="sm">
            <Link href="/nextlab/board">진행단계별 보드 보기</Link>
          </Button>
        </div>
        <StaffCasesView basePath="/nextlab/cases" searchParams={searchParams} items={cases} />
      </div>
    </main>
  );
}
