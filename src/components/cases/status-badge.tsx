import { cn } from '@/lib/utils';
import { CASE_STATUS_META, type CaseStatus, type StatusTone } from '@/types/case-status';
import { fmt, PLATFORM_BRANDING, type Branding } from '@/lib/programs/branding';

const TONE_CLASS: Record<StatusTone, string> = {
  pending: 'bg-status-pending-bg text-status-pending',
  progress: 'bg-status-progress-bg text-status-progress',
  approved: 'bg-status-approved-bg text-status-approved',
  rejected: 'bg-status-rejected-bg text-status-rejected',
};

interface StatusBadgeProps {
  status: CaseStatus;
  /** 앞에 단계 번호 표시 (예: "5 · 지급 대기") */
  showStep?: boolean;
  /** 짧은 라벨 사용 (표·차트) */
  short?: boolean;
  /** 행사 브랜딩 — `{client}` `{operator}` 치환 */
  branding?: Branding;
  className?: string;
}

/** 케이스 상태 공통 배지 — 모든 화면에서 이 컴포넌트로 상태를 표시해 색상·라벨을 통일한다. */
export function StatusBadge({ status, showStep = false, short = false, branding = PLATFORM_BRANDING, className }: StatusBadgeProps) {
  const meta = CASE_STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONE_CLASS[meta.tone],
        className,
      )}
    >
      {showStep && meta.step > 0 && <span className="tabular-nums opacity-70">{meta.step}</span>}
      {short ? meta.short : fmt(meta.label, branding)}
    </span>
  );
}
