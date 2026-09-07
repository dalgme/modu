import { Check } from 'lucide-react';

import { CASE_STEP_ORDER, CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { cn } from '@/lib/utils';

/**
 * 멘티 전용 진행 여정: 현재 단계·남은 단계를 세로 스텝으로 표시.
 * 완료(체크)·현재(강조)·예정(흐림) 3상태. 반려 시 승인 단계를 반려색으로.
 */
export function MenteeJourney({ status }: { status: CaseStatus }) {
  const rejected = status === 'rejected';
  const current = CASE_STATUS_META[status].step;
  const total = CASE_STEP_ORDER.length;
  const remaining = Math.max(0, total - current);

  // 종결(포기) 상태는 여정 대신 종결 안내
  if (current === 0) {
    return (
      <div className="rounded-md border border-status-rejected/40 bg-status-rejected-bg/50 p-4 text-sm">
        <p className="font-medium text-status-rejected">{CASE_STATUS_META[status].label}</p>
        <p className="mt-1 text-muted-foreground">
          지원이 종결되었습니다. 문의사항은 운영팀에 연락해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          현재 <span className="font-semibold text-status-progress">{current}단계</span> ·{' '}
          {CASE_STATUS_META[status].label}
        </span>
        <span className="text-muted-foreground">
          남은 단계 <span className="font-semibold text-foreground">{remaining}개</span>
        </span>
      </div>

      <ol className="flex flex-col">
        {CASE_STEP_ORDER.map((s, i) => {
          const step = i + 1;
          const done = step < current;
          const isCurrent = step === current;
          const last = step === total;
          return (
            <li key={s} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    done && 'bg-status-approved text-white',
                    isCurrent && !rejected && 'bg-status-progress text-white',
                    isCurrent && rejected && 'bg-status-rejected text-white',
                    !done && !isCurrent && 'bg-muted text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : step}
                </span>
                {!last && (
                  <span className={cn('w-0.5 flex-1', done ? 'bg-status-approved' : 'bg-muted')} />
                )}
              </div>
              <div className={cn('pb-4', last && 'pb-0')}>
                <p
                  className={cn(
                    'text-sm',
                    isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {CASE_STATUS_META[s].label}
                </p>
                {isCurrent && (
                  <p className="mt-0.5 text-xs text-status-progress">진행 중</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
