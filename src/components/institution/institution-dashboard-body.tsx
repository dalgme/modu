import Link from 'next/link';
import { RotateCcw, FilePenLine } from 'lucide-react';

import type { CaseListItem } from '@/lib/data/cases';
import { Button } from '@/components/ui/button';
import { StaffCasesView, type StaffCasesSearchParams } from '@/components/cases/staff-cases-view';
import { CaseActionQueue } from '@/components/cases/case-action-queue';
import { OperatorRequestGeneralButton } from '@/components/cases/operator-request-general-button';

/**
 * 진흥원 대시보드 본문. 실제 진흥원 페이지와 넥스트랩 회원 열람(view-as)에서 공용으로 렌더해
 * 두 화면이 완전히 동일하게 보이도록 한다.
 * @param basePath 케이스 링크 접두 (실제 '/institution/cases', 열람 '/nextlab/cases')
 * @param editBasePath 재등록 편집 링크 접두 (실제 '/institution/cases', 열람 '/nextlab/cases')
 */
export function InstitutionDashboardBody({
  cases,
  recalled,
  searchParams,
  basePath,
  editBasePath,
  viewAsUserId,
}: {
  cases: CaseListItem[];
  recalled: CaseListItem[];
  searchParams: StaffCasesSearchParams;
  basePath: string;
  editBasePath: string;
  /** 회원 열람 중이면 대상 회원 id — 메뉴 링크를 view-as 경로로 유지해 열람이 풀리지 않게 한다. */
  viewAsUserId?: string;
}) {
  // 열람 중에는 진흥원 실제 경로 대신 view-as 경로로(탭이 있으면 해당 탭, 없으면 열람 대시보드)
  const menuHref = (real: string, tab?: string) =>
    viewAsUserId
      ? tab
        ? `/nextlab/view/${viewAsUserId}?tab=${tab}`
        : `/nextlab/view/${viewAsUserId}`
      : real;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">진흥원 대시보드</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            전체 케이스 조회 및 지원/지급 신청 승인·반려.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OperatorRequestGeneralButton />
          <Button asChild>
            <Link href={menuHref('/institution/cases/new')}>멘티기업 등록</Link>
          </Button>
        </div>
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
            넥스트랩이 멘토 배정을 회수한 기업입니다. 클릭해 신청서 PDF를 다시 업로드하고 내용을
            확인·보완해 재등록(멘토 배정 요청)하세요.
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
                  <Link href={`${editBasePath}/${c.id}/edit`}>
                    <FilePenLine className="h-3.5 w-3.5" />
                    재등록 진행
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CaseActionQueue
        title="승인 대기"
        description="넥스트랩 검수를 마친 지원신청·지급신청 건입니다. 승인 또는 반려 처리하세요."
        items={cases.filter(
          (c) => c.status === 'reviewed' || c.status === 'payment_application_drafted',
        )}
        basePath={basePath}
        ctaLabel="승인 처리"
        emptyText="승인 대기 건이 없습니다."
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">케이스 조회 · 진행현황</h2>
          <Button asChild variant="outline" size="sm">
            <Link href={menuHref('/institution/board', 'board')}>진행단계별 보드 보기</Link>
          </Button>
        </div>
        <StaffCasesView basePath={basePath} searchParams={searchParams} items={cases} />
      </div>
    </div>
  );
}
