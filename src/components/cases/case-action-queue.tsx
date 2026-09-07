import Link from 'next/link';

import type { CaseListItem } from '@/lib/data/cases';
import type { CaseStatus } from '@/types/case-status';
import { formatDate } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { MentorElapsedBadge } from '@/components/cases/mentor-elapsed-card';
import { cn } from '@/lib/utils';

/** 대기 큐에서 '어떤 처리'가 필요한지 구분하는 배지 (검수요청 vs 지급신청 등) */
const QUEUE_BADGE: Partial<Record<CaseStatus, { label: string; cls: string }>> = {
  registered: {
    label: '멘토 배정',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
  mentor_assigned: {
    label: '멘티 확인·연락',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
  under_review: {
    label: '지원신청서 검수요청',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  reviewed: {
    label: '지원 승인 대기',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  execution_docs_submitted: {
    label: '지급신청서 작성',
    cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  },
  payment_application_drafted: {
    label: '지급 승인 대기',
    cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  },
};

/**
 * 처리 대기 케이스 강조 큐 (적체 방지용).
 * 호출부에서 이미 필터된 items 를 넘긴다.
 *  - 넥스트랩: 신규 신청(registered) → 멘토 배정
 *  - 멘토: 신규 배정(mentor_assigned) → 멘티 확인·연락
 */
export function CaseActionQueue({
  title,
  description,
  items,
  basePath,
  ctaLabel,
  emptyText,
  secondaryCta,
}: {
  title: string;
  description: string;
  items: CaseListItem[];
  basePath: string;
  ctaLabel: string;
  emptyText: string;
  /** 주 버튼 왼쪽에 다른 색으로 노출할 보조 버튼 (예: 접수내용 확인). href = basePath/{id}/{hrefSuffix} */
  secondaryCta?: { label: string; hrefSuffix: string };
}) {
  const has = items.length > 0;

  return (
    <section
      className={cn(
        'rounded-lg border p-4',
        has ? 'border-status-progress/50 bg-status-progress-bg/50' : 'bg-card',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums',
            has ? 'bg-status-progress text-white' : 'bg-muted text-muted-foreground',
          )}
        >
          {items.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      {!has ? (
        <p className="mt-3 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {QUEUE_BADGE[c.status] && (
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-bold',
                        QUEUE_BADGE[c.status]!.cls,
                      )}
                    >
                      {QUEUE_BADGE[c.status]!.label}
                    </span>
                  )}
                  <span className="font-medium">{c.business_name}</span>
                  <MentorElapsedBadge assignedAt={c.mentorAssignedAt} />
                  <span className="text-xs text-muted-foreground">
                    {c.supportTypeName ?? '-'} · 담당 멘토 {c.mentorName ?? '미배정'} · 대표{' '}
                    {c.owner_name} · 등록 {formatDate(c.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="text-foreground">업종</span>{' '}
                  {c.business_type ?? '-'}
                  {c.item ? ` / ${c.item}` : ''} · <span className="text-foreground">연락처</span>{' '}
                  {c.phone} · <span className="text-foreground">주소</span> {c.address}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {secondaryCta && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
                  >
                    <Link href={`${basePath}/${c.id}/${secondaryCta.hrefSuffix}`}>
                      {secondaryCta.label}
                    </Link>
                  </Button>
                )}
                <Button asChild size="sm">
                  <Link href={`${basePath}/${c.id}`}>{ctaLabel}</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
