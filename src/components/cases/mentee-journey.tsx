import { cn } from '@/lib/utils';
import { CASE_STATUS_META, CASE_STEP_ORDER, statusStep, type CaseStatus } from '@/types/case-status';
import { fmt, PLATFORM_BRANDING, type Branding } from '@/lib/programs/branding';

/** 멘티용 진행 여정 카드 — 7단계를 큼직하게, 현재 단계 설명 포함 */
export function MenteeJourney({
  status,
  roundsDone,
  requiredRounds,
  branding = PLATFORM_BRANDING,
}: {
  status: CaseStatus;
  roundsDone: number;
  requiredRounds: number;
  branding?: Branding;
}) {
  const current = statusStep(status);
  const meta = CASE_STATUS_META[status];
  const guide: Record<CaseStatus, string> = {
    registered: '{operator}가 담당 멘토를 배정하면 알림을 드립니다.',
    mentor_assigned: '담당 멘토가 곧 연락드립니다. 일정을 잡고 첫 컨설팅을 진행하세요.',
    in_progress: `컨설팅 ${roundsDone}/${requiredRounds}회 진행. 회차마다 내용을 확인하고 서명해 주세요.`,
    reassignment_pending: '담당 멘토가 변경될 예정입니다. {operator}가 새 멘토를 배정합니다.',
    closure_requested: '멘토가 관찰의견서를 제출했습니다. {operator} 검수 중입니다. 만족도 조사에 참여해 주세요.',
    revision_requested: '{operator}가 멘토에게 보완을 요청했습니다.',
    settlement_pending: '{operator} 검수가 끝났습니다. 정산 절차가 진행됩니다.',
    settlement_batched: '지급 품의가 진행 중입니다.',
    closed: '모든 과정이 종결되었습니다. 참여해 주셔서 감사합니다.',
    withdrawn: '중도 종료된 케이스입니다.',
  };

  return (
    <div className="rounded-2xl border bg-background p-5 shadow-sm">
      <ol className="grid grid-cols-7 gap-1">
        {CASE_STEP_ORDER.map((s) => {
          const step = CASE_STATUS_META[s].step;
          const done = step < current;
          const isCurrent = step === current;
          return (
            <li key={s} className="flex flex-col items-center gap-1 text-center">
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                  done && 'bg-status-approved text-white',
                  isCurrent && (meta.tone === 'rejected' ? 'bg-status-rejected text-white' : 'bg-primary text-primary-foreground'),
                  !done && !isCurrent && 'bg-muted text-muted-foreground',
                )}
              >
                {step}
              </span>
              <span className={cn('text-[10px] leading-tight', isCurrent ? 'font-semibold' : 'text-muted-foreground')}>
                {CASE_STATUS_META[s].short}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2">
        <p className="text-sm font-semibold">{fmt(meta.label, branding)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{fmt(guide[status], branding)}</p>
      </div>
    </div>
  );
}
