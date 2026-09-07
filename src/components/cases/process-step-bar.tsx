import { CASE_STEP_ORDER, CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { cn } from '@/lib/utils';

/**
 * 케이스 11단계 진행상황을 가로 막대로 시각화한다.
 * 완료 단계 = 승인색, 현재 단계 = 진행색(반려면 반려색), 이후 = muted.
 * 진흥원·넥스트랩·멘토 대시보드에서 업체별 진행단계 표현에 공통 사용.
 */
export function ProcessStepBar({
  status,
  showLabel = true,
}: {
  status: CaseStatus;
  showLabel?: boolean;
}) {
  const rejected = status === 'rejected';
  const current = CASE_STATUS_META[status].step; // 1..11, 종결(포기)=0
  const total = CASE_STEP_ORDER.length;

  // 정규 단계가 아닌 종결 상태(포기)는 진행막대 대신 종결 표시
  if (current === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="h-2 w-full rounded-full bg-status-rejected/30" />
        {showLabel && (
          <p className="text-xs font-medium text-status-rejected">
            {CASE_STATUS_META[status].label}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        {CASE_STEP_ORDER.map((s, i) => {
          const step = i + 1;
          const done = step < current;
          const isCurrent = step === current;
          return (
            <div
              key={s}
              title={`${step}. ${CASE_STATUS_META[s].label}`}
              className={cn(
                'h-2 flex-1 rounded-full transition-colors',
                done && 'bg-status-approved',
                isCurrent && !rejected && 'bg-status-progress',
                isCurrent && rejected && 'bg-status-rejected',
                !done && !isCurrent && 'bg-muted',
              )}
            />
          );
        })}
      </div>
      {showLabel && (
        <p className="text-xs text-muted-foreground">
          <span className="tabular-nums font-medium text-foreground">
            {current}/{total}
          </span>{' '}
          · {CASE_STATUS_META[status].label}
        </p>
      )}
    </div>
  );
}
