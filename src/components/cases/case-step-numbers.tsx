import { CASE_STEP_ORDER, CASE_STATUS_META, statusStep, type CaseStatus } from '@/types/case-status';
import { cn } from '@/lib/utils';

/**
 * 진행단계 숫자 표시줄 (1~11). 현재 단계까지 색으로 채워 한눈에 위치를 보여준다.
 * 완료=승인색, 현재=진행색(반려면 반려색), 이후=muted. 종결(포기)=별도 표시.
 * 대시보드 상태 열에서 상태명 위에 배치한다.
 */
export function CaseStepNumbers({ status }: { status: CaseStatus }) {
  const current = statusStep(status);
  const rejected = status === 'rejected';

  if (current === 0) {
    return (
      <span className="inline-flex rounded-[3px] bg-status-rejected/15 px-1.5 py-0.5 text-[10px] font-semibold text-status-rejected">
        종결
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-0.5">
      {CASE_STEP_ORDER.map((s, i) => {
        const step = i + 1;
        const done = step < current;
        const isCurrent = step === current;
        return (
          <span
            key={s}
            title={`${step}. ${CASE_STATUS_META[s].label}`}
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded-[3px] text-[9px] font-bold tabular-nums',
              done && 'bg-status-approved text-white',
              isCurrent && !rejected && 'bg-status-progress text-white',
              isCurrent && rejected && 'bg-status-rejected text-white',
              !done && !isCurrent && 'bg-muted text-muted-foreground/60',
            )}
          >
            {step}
          </span>
        );
      })}
    </div>
  );
}
