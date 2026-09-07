import Link from 'next/link';
import { BookOpen, ArrowRight } from 'lucide-react';

import type { CaseListItem } from '@/lib/data/cases';
import type { Branding } from '@/lib/programs/branding';
import { CaseActionQueue } from '@/components/cases/case-action-queue';
import { CaseCard } from '@/components/cases/case-card';

/** 멘토 대시보드 본문 (실제 멘토 화면과 운영사 회원 열람에서 공용) */
export function MentorDashboardBody({
  name,
  cases,
  basePath,
  branding,
  viewAsUserId,
}: {
  name: string;
  cases: CaseListItem[];
  basePath: string;
  branding: Branding;
  viewAsUserId?: string;
}) {
  const guideHref = viewAsUserId ? `/nextlab/view/${viewAsUserId}?tab=guide` : '/mentor/guide';
  const needsAction = cases.filter((c) =>
    ['mentor_assigned', 'in_progress', 'revision_requested'].includes(c.status),
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">멘토 대시보드</h1>
          <p className="mt-1 text-sm text-muted-foreground">{name}님의 담당 멘티 진행현황입니다.</p>
        </div>
        <Link
          href={guideHref}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
        >
          <BookOpen className="h-4 w-4" />
          멘토 이용 안내
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <CaseActionQueue
        title="진행할 컨설팅"
        description="새로 배정됐거나 회차가 남은 멘티입니다. 회차 등록과 관찰의견서 작성은 P3 에서 열립니다."
        items={needsAction}
        basePath={basePath}
        ctaLabel="케이스 열기"
        emptyText="진행할 케이스가 없습니다."
        branding={branding}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">담당 멘티 전체</h2>
        {cases.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            아직 배정된 케이스가 없습니다.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {cases.map((c) => (
              <li key={c.id}>
                <CaseCard item={c} href={`${basePath}/${c.id}`} branding={branding} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
