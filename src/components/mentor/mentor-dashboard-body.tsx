import Link from 'next/link';
import { BookOpen, ArrowRight, PenLine } from 'lucide-react';

import type { CaseListItem } from '@/lib/data/cases';
import { CaseProgressList } from '@/components/cases/case-progress-list';
import { CaseActionQueue } from '@/components/cases/case-action-queue';

/**
 * 멘토 대시보드 본문. 실제 멘토 페이지와 넥스트랩 회원 열람(view-as)에서 공용으로 렌더해
 * 두 화면이 완전히 동일하게 보이도록 한다.
 * @param basePath 케이스 링크 접두 (실제 '/mentor/cases', 열람 '/nextlab/cases')
 * @param viewAsUserId 회원 열람 중이면 대상 회원 id — 메뉴 링크를 view-as 경로로 유지해 열람이 풀리지 않게 한다.
 */
export function MentorDashboardBody({
  name,
  cases,
  basePath,
  viewAsUserId,
}: {
  name: string;
  cases: CaseListItem[];
  basePath: string;
  viewAsUserId?: string;
}) {
  const guideHref = viewAsUserId ? `/nextlab/view/${viewAsUserId}?tab=guide` : '/mentor/guide';
  const tasksHref = viewAsUserId ? `/nextlab/view/${viewAsUserId}?tab=tasks` : '/mentor/tasks';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">멘토 대시보드</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {name}님의 담당 멘티기업 진행현황입니다.
          </p>
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

      {/* 현장 팁 안내 bar */}
      <Link
        href={tasksHref}
        className="group flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 shadow-sm transition-colors hover:bg-primary/15"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <PenLine className="h-5 w-5" />
        </span>
        <p className="text-sm leading-relaxed text-foreground sm:text-[15px]">
          멘티기업을 방문하시면, <b className="text-primary">멘티별 업무진행</b> 메뉴에서{' '}
          <b className="text-primary">[멘티 미팅 서명]</b>부터 받아놓으시면 업무를 빠르게 진행하실 수
          있습니다.
        </p>
        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
      </Link>

      <CaseActionQueue
        title="신규 배정 · 확인 대기"
        description="넥스트랩이 새로 배정한 케이스입니다. [케이스 열기]로 들어가 멘티에게 연락한 뒤, 케이스 안의 '멘티 확인·연락 기록' 버튼을 누르면 이 목록에서 사라지고 다음 단계로 넘어갑니다."
        items={cases.filter((c) => c.status === 'mentor_assigned')}
        basePath={basePath}
        ctaLabel="케이스 열기"
        emptyText="새로 배정된 케이스가 없습니다."
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">담당 기업 진행현황</h2>
        <CaseProgressList items={cases} basePath={basePath} emptyText="아직 배정된 케이스가 없습니다." />
      </div>
    </div>
  );
}
