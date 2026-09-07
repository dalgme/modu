/**
 * 케이스 상태 (설계문서 10.2 case_status enum).
 *
 * 개선된 프로세스(2026-08) — 총 11단계.
 * 멘토 가이드 플로우: 멘토링 일지 → 컨설팅 결과보고서 → 지원신청서 → 공사업체 서류 → 신청서 송신.
 *  - 컨설팅 결과보고서 생성 시: log_completed → application_drafted(지원신청서 작성 및 접수 준비 중)
 *  - '신청서 송신하기' 시: application_drafted → under_review(지원신청서 검수 중)
 *  - 넥스트랩 검수 승인 시: under_review → reviewed(검수 완료)
 * 접힘(fold) 처리 — 독립 단계가 아니며 UI 표시 단계를 다른 단계와 공유하는 상태:
 *  - contractor_registered → 지원신청서(application_drafted)와 동일 5단계 (구 멘티 사전지원 레거시)
 *  - execution_docs_submitted → 지급신청서(payment_application_drafted)와 동일 10단계
 *    (시공·지급증빙 등록은 지급신청서 작성 단계에 병합)
 */
export const CASE_STATUSES = [
  'registered',
  'mentor_assigned',
  'contacted',
  'log_completed',
  'contractor_registered',
  'application_drafted',
  'under_review',
  'reviewed',
  'approved',
  'rejected',
  'notified',
  'execution_docs_submitted',
  'payment_application_drafted',
  'payment_approved',
  'withdrawn',
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

/** 상태 톤 — 배지·타임라인 색상 그룹 (대기/진행/승인/반려) */
export type StatusTone = 'pending' | 'progress' | 'approved' | 'rejected';

interface StatusMeta {
  /** 워크플로우 단계 번호 (1~11). 정규 단계가 아닌 종결 상태(포기)는 0. */
  step: number;
  /** 한글 라벨 */
  label: string;
  /** 색상 톤 */
  tone: StatusTone;
}

export const CASE_STATUS_META: Record<CaseStatus, StatusMeta> = {
  registered: { step: 1, label: '대상자 등록', tone: 'pending' },
  mentor_assigned: { step: 2, label: '멘토링 운영 중', tone: 'progress' },
  contacted: { step: 3, label: '멘티 확인·연락', tone: 'progress' },
  log_completed: { step: 4, label: '멘토링 일지 완료', tone: 'progress' },
  // 컨설팅 결과보고서 생성 시 진입 — 지원신청서 작성·공사업체 서류 준비(송신 전) 단계.
  application_drafted: { step: 5, label: '지원신청서 작성 및 접수 준비 중', tone: 'progress' },
  // 레거시(구 멘티 사전지원 제출) — 지원신청서 단계로 접어 표시. 독립 단계 아님.
  contractor_registered: { step: 5, label: '지원신청서 준비(공사업체)', tone: 'progress' },
  // 멘토가 '신청서 송신하기' 클릭 시 진입 — 넥스트랩 검수 대기.
  under_review: { step: 6, label: '지원신청서 검수 중', tone: 'progress' },
  reviewed: { step: 7, label: '넥스트랩 검수 완료', tone: 'progress' },
  approved: { step: 8, label: '진흥원 승인', tone: 'approved' },
  rejected: { step: 8, label: '진흥원 반려', tone: 'rejected' },
  notified: { step: 9, label: '승인 통보 완료', tone: 'progress' },
  // 지급신청서 작성 단계(10)에 병합 — 증빙 등록은 지급신청 준비의 하위 작업. 독립 단계 아님.
  execution_docs_submitted: { step: 10, label: '지급신청서 준비(증빙 등록)', tone: 'progress' },
  payment_application_drafted: { step: 10, label: '지급신청서 작성', tone: 'progress' },
  payment_approved: { step: 11, label: '지급 승인 완료', tone: 'approved' },
  withdrawn: { step: 0, label: '지원 포기(종결)', tone: 'rejected' },
};

/** 진흥원 승인/반려 단계 번호(파생) — 하드코딩 대신 이 상수를 사용. */
export const APPROVAL_STEP = CASE_STATUS_META.approved.step;

/**
 * 멘티 타임라인용 정규 11단계 순서.
 * 승인 단계는 대표로 'approved' 를 넣고, 실제 케이스가 rejected 면 UI 에서 분기 표시한다.
 * 접힌 상태(contractor_registered→5, execution_docs_submitted→10)는 순서에 포함하지 않는다.
 */
export const CASE_STEP_ORDER: CaseStatus[] = [
  'registered',
  'mentor_assigned',
  'contacted',
  'log_completed',
  'application_drafted',
  'under_review',
  'reviewed',
  'approved',
  'notified',
  'payment_application_drafted',
  'payment_approved',
];

/** 상태값의 단계 번호(1~11) 반환 */
export function statusStep(status: CaseStatus): number {
  return CASE_STATUS_META[status].step;
}
