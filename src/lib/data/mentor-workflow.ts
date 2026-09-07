import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { logRequirement } from '@/lib/workflow/mentor-tasks';
import { getContractorConfig, contractorDocsComplete } from '@/lib/data/contractor-config';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';

/** 지원신청서에 첨부하는 멘티기업 사업자등록증 doc_key */
export const APPLICANT_BIZ_REG_DOC_KEY = 'applicant_biz_reg';

export interface MentorWorkflowState {
  min: number;
  max: number;
  isClosure: boolean;
  typeLabel: string; // 경영개선 / 폐업정리
  // 1) 멘토링 일지
  webLogCount: number;
  uploadedReportCount: number;
  roundsDone: number; // 완료 회차 수(웹+첨부, 합산)
  // 2) 컨설팅 결과보고서
  consultingEnabled: boolean; // roundsDone >= min
  consultingDone: boolean;
  // 3) 지원신청서
  applicationEnabled: boolean; // consultingDone
  applicationDrafted: boolean; // 임시저장 이력(내용 존재)
  applicationProvided: boolean; // 신청서 제출본(웹 최종저장 또는 파일 업로드)
  applicantBizRegDone: boolean; // 멘티 사업자등록증 첨부
  applicationFinalized: boolean; // 최종저장 완료(제출본 존재. 사업자등록증은 선택)
  // 4) 공사업체 서류
  contractorEnabled: boolean; // applicationFinalized
  contractorConfigured: boolean; // 업체 수·간판 구성 완료
  contractorDocsDone: boolean; // 구성된 모든 업체 필수 서류 완료
  // 5) 송신
  submitEnabled: boolean; // contractorDocsDone
  submitted: boolean; // 송신 완료(넥스트랩 검수 중, under_review~)
}

const step = (s: CaseStatus) => CASE_STATUS_META[s].step;

/** 멘토 작업(가이드 플로우) 상태 계산 — 단계별 활성화/완료 여부 */
export async function getMentorWorkflowState(
  caseId: string,
  supportTypeCode: string | null,
  status: CaseStatus,
): Promise<MentorWorkflowState> {
  const admin = createAdminClient();
  const { min, max } = logRequirement(supportTypeCode);
  const isClosure = supportTypeCode === 'closure';

  const [
    { count: webLogCount },
    { count: uploadedReportCount },
    { count: consultingCount },
    { data: appRow },
    { count: applicantBizRegCount },
    { count: uploadedApplicationCount },
    contractorConfigResult,
  ] = await Promise.all([
    admin.from('mentoring_logs').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
    admin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('case_id', caseId)
      .eq('doc_key', 'mentoring_report'),
    admin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('case_id', caseId)
      .eq('doc_key', 'consulting_report'),
    admin
      .from('support_applications')
      .select('content')
      .eq('case_id', caseId)
      .maybeSingle(),
    admin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('case_id', caseId)
      .eq('doc_key', APPLICANT_BIZ_REG_DOC_KEY),
    admin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('case_id', caseId)
      .eq('doc_key', 'support_application_file'),
    getContractorConfig(caseId),
  ]);
  const contractorConfig = contractorConfigResult;

  const roundsDone = Math.min((webLogCount ?? 0) + (uploadedReportCount ?? 0), max);
  const consultingEnabled = roundsDone >= min;
  const consultingDone = (consultingCount ?? 0) > 0;

  // '송신 완료' 판정 = under_review(검수 중) 이상. application_drafted 는 컨설팅 보고서 생성 시점의
  // '작성·접수(송신 전)' 단계이므로 submitted 로 보지 않는다.
  const submitted = step(status) >= step('under_review');
  const content = (appRow?.content ?? null) as { finalized_at?: string | null } | null;
  const applicationDrafted =
    !!(content && Object.keys(content).length > 0) || (uploadedApplicationCount ?? 0) > 0 || submitted;
  const applicantBizRegDone = (applicantBizRegCount ?? 0) > 0;
  // 신청서 제출본: 웹 최종저장(content.finalized_at) 또는 완성본 파일 업로드
  const applicationProvided =
    !!content?.finalized_at || (uploadedApplicationCount ?? 0) > 0 || submitted;
  // 단계 완료 = 제출본 존재. 멘티기업 사업자등록증은 '선택'이라 완료 조건에서 제외.
  const applicationFinalized = submitted || applicationProvided;

  const contractorConfigured = !!contractorConfig;
  const contractorDocsDone = await contractorDocsComplete(caseId, contractorConfig);

  return {
    min,
    max,
    isClosure,
    typeLabel: isClosure ? '폐업정리' : '경영개선',
    webLogCount: webLogCount ?? 0,
    uploadedReportCount: uploadedReportCount ?? 0,
    roundsDone,
    consultingEnabled,
    consultingDone,
    applicationEnabled: consultingDone,
    applicationDrafted,
    applicationProvided,
    applicantBizRegDone,
    applicationFinalized,
    contractorEnabled: applicationFinalized,
    contractorConfigured,
    contractorDocsDone,
    submitEnabled: contractorDocsDone,
    submitted,
  };
}
