import Link from 'next/link';
import { NotebookPen, FileText, ExternalLink } from 'lucide-react';

import type { CaseListItem } from '@/lib/data/cases';
import type { MentoringLogRow } from '@/lib/data/mentoring-logs';
import { formatWallClock } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/**
 * 멘티기업별 멘토링 일지 열람 허브 (진흥원·넥스트랩 공용, 읽기 전용).
 * 좌측 세로 메뉴에서 '번호. 업체명(총 회차)'을 고르면, 우측에 업체 요약 + 회차별 '출력 원본'을 표시한다.
 * 선택은 URL(?case=id) 기반이라 서버에서 렌더한다(현황판과 동일 방식).
 * @param cases        표시할 케이스(멘티기업) 목록
 * @param logsByCase   케이스ID → 회차 배열 (listMentoringLogsByCases 결과, 방문일 오름차순)
 * @param caseHrefBase 케이스 경로 접두 (예: `/institution/cases`, `/nextlab/cases`)
 * @param selfPath     이 페이지 경로 (예: `/nextlab/mentoring-logs`) — 좌측 메뉴 링크용
 * @param activeId     현재 선택된 케이스ID (?case=)
 */
export function MentoringLogDirectory({
  cases,
  logsByCase,
  caseHrefBase,
  selfPath,
  activeId,
}: {
  cases: CaseListItem[];
  logsByCase: Map<string, MentoringLogRow[]>;
  caseHrefBase: string;
  selfPath: string;
  activeId?: string;
}) {
  if (cases.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        표시할 멘티기업이 없습니다.
      </div>
    );
  }

  const activeIndex = Math.max(
    0,
    cases.findIndex((c) => c.id === activeId),
  );
  const active = cases[activeIndex] ?? cases[0]!;
  const activeLogs = logsByCase.get(active.id) ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      {/* 좌측: 멘티기업 메뉴 (번호. 업체명 (총 회차)) */}
      <nav className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto rounded-lg border bg-card p-2">
        {cases.map((c, i) => {
          const count = logsByCase.get(c.id)?.length ?? 0;
          const isActive = c.id === active.id;
          return (
            <Link
              key={c.id}
              href={`${selfPath}?case=${c.id}`}
              aria-current={isActive ? 'page' : undefined}
              scroll={false}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              <span
                className={cn(
                  'shrink-0 tabular-nums text-xs font-bold',
                  isActive ? 'text-primary-foreground/80' : 'text-muted-foreground',
                )}
              >
                {i + 1}.
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{c.business_name}</span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 text-xs tabular-nums',
                  isActive
                    ? 'bg-white/20 text-primary-foreground'
                    : count > 0
                      ? 'bg-status-approved/15 text-status-approved'
                      : 'bg-muted text-muted-foreground/70',
                )}
              >
                {count}회차
              </span>
            </Link>
          );
        })}
      </nav>

      {/* 우측: 선택 기업 요약 + 회차별 출력 원본 */}
      <div className="flex flex-col gap-4">
        <section className="rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <NotebookPen className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-semibold">
                <span className="tabular-nums text-muted-foreground">{activeIndex + 1}. </span>
                {active.business_name}
              </h2>
            </div>
            <Link
              href={`${caseHrefBase}/${active.id}`}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              케이스 상세
            </Link>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              대표 <span className="font-medium text-foreground">{active.owner_name}</span>
            </span>
            <span>
              멘토{' '}
              <span className="font-medium text-foreground">{active.mentorName ?? '미배정'}</span>
            </span>
            <span>
              지원유형{' '}
              <span className="font-medium text-foreground">{active.supportTypeName ?? '-'}</span>
            </span>
            <span>
              총 <span className="font-semibold text-foreground">{activeLogs.length}</span>회차
            </span>
          </p>
        </section>

        {activeLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            아직 작성된 멘토링 일지가 없습니다.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeLogs.map((l, i) => (
              <li key={l.id}>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-l-4 border-status-approved/30 border-l-status-approved bg-status-approved-bg p-3 dark:bg-status-approved/10">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    <span className="shrink-0 rounded-full bg-status-approved px-2 py-0.5 text-xs font-bold text-white">
                      {i + 1}회차
                    </span>
                    <span className="font-medium">{formatWallClock(l.visited_at)}</span>
                    {l.topic && <span className="truncate text-muted-foreground">· {l.topic}</span>}
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`${caseHrefBase}/${active.id}/log/${l.id}/view`}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      출력 원본
                    </Link>
                    <a
                      href={`/api/cases/${active.id}/log/${l.id}/pdf`}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      다운로드
                    </a>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
