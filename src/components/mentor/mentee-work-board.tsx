import Link from 'next/link';

import { type CaseStatus } from '@/types/case-status';
import { planMentorTasks } from '@/lib/workflow/mentor-tasks';
import { StatusBadge } from '@/components/cases/status-badge';
import { MentorElapsedBadge } from '@/components/cases/mentor-elapsed-card';
import { MenteeQuickActions } from '@/components/mentor/mentee-quick-actions';
import { MentorWorkflow } from '@/components/cases/mentor-workflow';
import { cn } from '@/lib/utils';

export interface MenteeWorkItem {
  id: string;
  businessName: string;
  supportTypeName: string | null;
  supportTypeCode: string | null;
  status: CaseStatus;
  logCount: number;
  /** 멘토 배정일시(ISO). 미배정이면 null. 배정 후 경과일 배지용 */
  mentorAssignedAt: string | null;
}

/**
 * 멘티별 업무진행.
 * 좌측 멘티기업 메뉴 + 우측에 케이스 상세와 동일한 5단계 가이드 플로우(MentorWorkflow)를 노출한다.
 * 선택은 URL(?case=id) 기반이라 서버에서 렌더한다.
 */
export async function MenteeWorkBoard({
  items,
  activeId,
}: {
  items: MenteeWorkItem[];
  activeId?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        담당 멘티기업이 없습니다. 넥스트랩의 멘토 배정을 기다려 주세요.
      </div>
    );
  }

  const active = items.find((i) => i.id === activeId) ?? items[0]!;
  const plan = planMentorTasks(active.status, active.supportTypeCode, active.logCount);

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      {/* 멘티기업 메뉴 */}
      <nav className="flex flex-col gap-1 rounded-lg border bg-card p-2">
        {items.map((it) => {
          const isActive = it.id === active.id;
          const p = planMentorTasks(it.status, it.supportTypeCode, it.logCount);
          return (
            <Link
              key={it.id}
              href={`/mentor/tasks?case=${it.id}`}
              aria-current={isActive ? 'page' : undefined}
              scroll={false}
              className={cn(
                'flex flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              <span className="truncate text-sm font-semibold">{it.businessName}</span>
              <span
                className={cn(
                  'truncate text-xs',
                  isActive ? 'text-primary-foreground/85' : 'text-muted-foreground',
                )}
              >
                {it.supportTypeName ?? '-'} · {p.summary}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* 선택 기업 — 케이스 상세와 동일한 5단계 가이드 플로우 */}
      <div className="flex flex-col gap-4">
        <section className="rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{active.businessName}</h2>
              <span className="text-xs text-muted-foreground">{active.supportTypeName ?? '-'}</span>
              <MentorElapsedBadge assignedAt={active.mentorAssignedAt} />
              <MenteeQuickActions caseId={active.id} businessName={active.businessName} />
            </div>
            <StatusBadge status={active.status} showStep />
          </div>
          <div className="mt-3 rounded-md bg-primary/5 px-3 py-2 text-sm">
            <span className="font-medium text-primary">다음 할 일 </span>
            <span className="text-foreground">· {plan.summary}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {plan.typeLabel} 멘토링 일지 요건: 최소 {plan.minLogs}회 · 최대 {plan.maxLogs}회 (현재{' '}
            {plan.logCount}회 작성)
          </p>
        </section>

        {/* 케이스 상세와 동일한 멘토 작업 5단계 */}
        <section className="rounded-lg border bg-card p-5">
          <h3 className="mb-3 text-base font-semibold">멘토 작업</h3>
          <MentorWorkflow
            caseId={active.id}
            businessName={active.businessName}
            supportTypeCode={active.supportTypeCode}
            status={active.status}
          />
        </section>
      </div>
    </div>
  );
}
