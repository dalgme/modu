import { cn } from '@/lib/utils';
import { CASE_STATUS_META, type CaseStatus, type StatusTone } from '@/types/case-status';
import { BATCH_STATUS_LABELS, SETTLEMENT_STATUS_LABELS } from '@/lib/settlement/labels';
import { fmt, PLATFORM_BRANDING, type Branding } from '@/lib/programs/branding';

const TONE_CLASS: Record<StatusTone, string> = {
  pending: 'bg-status-pending-bg text-status-pending',
  progress: 'bg-status-progress-bg text-status-progress',
  approved: 'bg-status-approved-bg text-status-approved',
  rejected: 'bg-status-rejected-bg text-status-rejected',
};

/** 케이스 외 도메인 상태 — 정산 · 품의 · 조사 · 문의. 라벨은 기존 상수, 톤만 여기서 매핑한다. */
export type StatusBadgeKind = 'case' | 'settlement' | 'batch' | 'survey' | 'inquiry';

interface GenericMeta {
  label: string;
  tone: StatusTone;
}

const SETTLEMENT_TONE: Record<string, StatusTone> = { pending: 'pending', batched: 'progress', confirmed: 'progress', paid: 'approved', canceled: 'rejected' };
const BATCH_TONE: Record<string, StatusTone> = { draft: 'pending', submitted: 'progress', confirmed: 'progress', paid: 'approved' };
const SURVEY_META: Record<string, GenericMeta> = {
  draft: { label: '준비', tone: 'pending' },
  open: { label: '진행 중', tone: 'approved' },
  closed: { label: '종료', tone: 'rejected' },
};
const INQUIRY_META: Record<string, GenericMeta> = {
  open: { label: '답변 대기', tone: 'pending' },
  pending: { label: '답변 대기', tone: 'pending' },
  answered: { label: '답변 완료', tone: 'approved' },
  closed: { label: '종료', tone: 'rejected' },
};

/** 종류·상태값 → 라벨·톤. 알 수 없는 값은 원문 라벨 + pending 톤. */
export function statusMeta(kind: StatusBadgeKind, status: string): GenericMeta {
  switch (kind) {
    case 'case': {
      const meta = CASE_STATUS_META[status as CaseStatus];
      return meta ? { label: meta.label, tone: meta.tone } : { label: status, tone: 'pending' };
    }
    case 'settlement':
      return { label: SETTLEMENT_STATUS_LABELS[status] ?? status, tone: SETTLEMENT_TONE[status] ?? 'pending' };
    case 'batch':
      return { label: BATCH_STATUS_LABELS[status] ?? status, tone: BATCH_TONE[status] ?? 'pending' };
    case 'survey':
      return SURVEY_META[status] ?? { label: status, tone: 'pending' };
    case 'inquiry':
      return INQUIRY_META[status] ?? { label: status, tone: 'pending' };
  }
}

type CaseBadgeProps = {
  kind?: 'case';
  status: CaseStatus;
};
type GenericBadgeProps = {
  kind: Exclude<StatusBadgeKind, 'case'>;
  status: string;
};

type StatusBadgeProps = (CaseBadgeProps | GenericBadgeProps) & {
  /** 앞에 단계 번호 표시 (케이스 전용, 예: "5 · 지급 대기") */
  showStep?: boolean;
  /** 짧은 라벨 사용 (표·차트, 케이스 전용) */
  short?: boolean;
  /** 행사 브랜딩 — `{client}` `{operator}` 치환 */
  branding?: Branding;
  className?: string;
};

/**
 * 상태 공통 배지 — 모든 화면에서 이 컴포넌트로 상태를 표시해 색상·라벨을 통일한다.
 * 기본은 케이스 상태, `kind` 로 정산·품의·조사·문의 상태도 같은 톤 체계로 그린다.
 */
export function StatusBadge(props: StatusBadgeProps) {
  const { showStep = false, short = false, branding = PLATFORM_BRANDING, className } = props;
  const kind: StatusBadgeKind = props.kind ?? 'case';
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold';

  if (kind === 'case') {
    const meta = CASE_STATUS_META[props.status as CaseStatus];
    if (!meta) return <span className={cn(base, TONE_CLASS.pending, className)}>{props.status}</span>;
    return (
      <span className={cn(base, TONE_CLASS[meta.tone], className)}>
        {showStep && meta.step > 0 && <span className="tabular-nums opacity-70">{meta.step}</span>}
        {short ? meta.short : fmt(meta.label, branding)}
      </span>
    );
  }
  const meta = statusMeta(kind, props.status);
  return <span className={cn(base, TONE_CLASS[meta.tone], className)}>{fmt(meta.label, branding)}</span>;
}
