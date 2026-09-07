import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { computeCaseLimit } from '@/lib/data/support-types';
import { formatDate, formatKRW, formatNumber } from '@/lib/utils/format';
import type { Tables } from '@/types/database';

type CaseRow = Tables<'cases'>;
type SupportType = Tables<'support_types'>;
type Contractor = Tables<'contractors'>;
type MentoringLog = Tables<'mentoring_logs'>;

/** 발주기관 명칭 (서식 하단 귀하 표기) */
const INSTITUTION = '대전일자리경제진흥원장';

function nz(v: string | number | null | undefined): string | number {
  return v === null || v === undefined ? '' : v;
}

/** 컨설턴트(멘토) 및 컨설팅 회차 정보 — 서식 2번 영역용 */
export interface ConsultingMeta {
  consultantName?: string | null;
  consultantPhone?: string | null;
  /** 회차별 방문일 (최대 3회) */
  consultingDates?: (string | null)[];
}

/** 외주업체 상세 필드 매핑 (여러 서식 공통) */
function contractorFields(contractor: Contractor | null): Record<string, string | number> {
  return {
    contractor_name: nz(contractor?.company_name),
    contractor_reg_no: nz(contractor?.business_reg_no),
    contractor_rep: nz(contractor?.representative),
    contractor_phone: nz(contractor?.phone),
    contractor_address: nz(contractor?.address),
    contractor_work_type: nz(contractor?.work_type),
    contractor_amount: contractor?.estimate_amount ? formatKRW(contractor.estimate_amount) : '',
  };
}

function consultingFields(meta?: ConsultingMeta): Record<string, string | number> {
  const dates = meta?.consultingDates ?? [];
  return {
    consultant_name: nz(meta?.consultantName),
    consultant_phone: nz(meta?.consultantPhone),
    consulting_date_1: dates[0] ? formatDate(dates[0]) : '',
    consulting_date_2: dates[1] ? formatDate(dates[1]) : '',
    consulting_date_3: dates[2] ? formatDate(dates[2]) : '',
    institution: INSTITUTION,
  };
}

/** 지원유형 코드 → 신청서 템플릿 key */
export function applicationTemplateKey(code: string): string {
  return code === 'closure' ? 'support_application_closure' : 'support_application_management';
}

export interface ApplicationContent {
  reason: string;
  requested_amount?: number;
  /** 경영개선자금 신청 항목 (붙임5): hygiene/safety/promo/env/pos */
  categories?: string[];
  /** 소요금액(부가세 제외) */
  cost_excl_vat?: number;
  /** 붙임5 5.추진계획 서술 (선택) */
  plan_intro?: string;
  plan_status?: string;
  plan_need?: string;
  plan_effect?: string;
  /** 붙임5 4.시공(제작)내용 — 멘토 편집값(멘티 공사업체 프리필) */
  construction_company?: string;
  construction_region?: string;
  construction_reg_no?: string;
  construction_rep?: string;
  construction_biztype?: string;
  construction_phone?: string;
  construction_mobile?: string;
  construction_period?: string;
  construction_content?: string;
}

/** 붙임5 신청항목 체크 표시 (선택=■ / 미선택=□) */
export const APPLICATION_CATEGORIES = [
  { key: 'hygiene', label: '위생관리' },
  { key: 'safety', label: '안전관리' },
  { key: 'promo', label: '홍보(광고)' },
  { key: 'env', label: '환경개선' },
  { key: 'pos', label: 'POS경비' },
] as const;

function categoryMarks(categories: string[] | undefined): Record<string, string> {
  const set = new Set(categories ?? []);
  return {
    cat_hygiene: set.has('hygiene') ? '■' : '□',
    cat_safety: set.has('safety') ? '■' : '□',
    cat_promo: set.has('promo') ? '■' : '□',
    cat_env: set.has('env') ? '■' : '□',
    cat_pos: set.has('pos') ? '■' : '□',
  };
}

/** 케이스 데이터 → 신청서 템플릿 플레이스홀더 매핑 (붙임5 경영개선 / 붙임1 폐업정리) */
export function buildApplicationData(
  caseRow: CaseRow,
  type: SupportType,
  contractor: Contractor | null,
  content: ApplicationContent,
  meta?: ConsultingMeta,
): Record<string, string | number | null> {
  const limit = computeCaseLimit(type, caseRow);
  return {
    // 1. 지원업체 현황
    business_name: caseRow.business_name,
    owner_name: caseRow.owner_name,
    business_reg_no: caseRow.business_reg_no,
    phone: caseRow.phone,
    address: caseRow.address,
    email: nz(caseRow.email),
    business_type: nz(caseRow.business_type),
    item: nz(caseRow.item),
    opened_at: formatDate(caseRow.opened_at),
    employee_count: nz(caseRow.employee_count),
    // 폐업정리 전용 (붙임1)
    closure_closed: caseRow.closure_status === 'closed' ? '■' : '□',
    closure_pending: caseRow.closure_status === 'pending' ? '■' : '□',
    closed_at: formatDate(caseRow.closed_at),
    // 금액 셀은 템플릿이 뒤에 ' 원'을 붙이므로 단위 없는 formatNumber 사용 ('원 원' 방지)
    revenue_last_year: formatNumber(caseRow.revenue_last_year),
    lease_deposit: formatNumber(caseRow.lease_deposit),
    monthly_rent: formatNumber(caseRow.monthly_rent),
    exclusive_area_pyeong: nz(caseRow.exclusive_area_pyeong),
    // 지원내역
    support_type_name: type.name,
    support_limit: formatKRW(limit),
    requested_amount: formatNumber(content.requested_amount),
    cost_excl_vat: formatNumber(content.cost_excl_vat ?? content.requested_amount),
    reason: content.reason,
    // 5. 추진계획 서술
    plan_intro: nz(content.plan_intro),
    plan_status: nz(content.plan_status),
    plan_need: nz(content.plan_need),
    plan_effect: nz(content.plan_effect),
    // 3. 신청항목 체크
    ...categoryMarks(content.categories),
    // 2. 컨설팅
    ...consultingFields(meta),
    // 4. 시공(제작) 내용 — 멘토 편집값 우선, 없으면 멘티 등록 공사업체값
    ...contractorFields(contractor),
    contractor_name: content.construction_company || nz(contractor?.company_name),
    contractor_reg_no: content.construction_reg_no || nz(contractor?.business_reg_no),
    contractor_rep: content.construction_rep || nz(contractor?.representative),
    contractor_phone: content.construction_phone || nz(contractor?.phone),
    contractor_work_type: content.construction_content || nz(contractor?.work_type),
    contractor_region: nz(content.construction_region),
    contractor_biztype: nz(content.construction_biztype),
    contractor_mobile: nz(content.construction_mobile),
    construction_period: nz(content.construction_period),
    application_date: formatDate(new Date().toISOString()),
  };
}

/** 지원유형 코드 → 지급신청서 템플릿 key */
export function paymentTemplateKey(code: string): string {
  return code === 'closure' ? 'payment_application_closure' : 'payment_application_management';
}

export interface PaymentData {
  amount: number | null;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  reportDueDate: string | null;
  /** 총소요비용(부가세 제외) — 미포착 시 신청금액으로 대체 */
  costExclVat?: number | null;
}

/** 케이스 데이터 + 지급 정보 → 지급신청서·완료보고서 템플릿 플레이스홀더 (붙임7/붙임4) */
export function buildPaymentData(
  caseRow: CaseRow,
  type: SupportType,
  contractor: Contractor | null,
  payment: PaymentData,
  meta?: ConsultingMeta,
): Record<string, string | number | null> {
  const limit = computeCaseLimit(type, caseRow);
  return {
    business_name: caseRow.business_name,
    owner_name: caseRow.owner_name,
    business_reg_no: caseRow.business_reg_no,
    phone: caseRow.phone,
    address: caseRow.address,
    support_type_name: type.name,
    support_limit: formatKRW(limit),
    exclusive_area_pyeong: nz(caseRow.exclusive_area_pyeong),
    // 금액 셀은 템플릿이 뒤에 ' 원'을 붙이므로 단위 없는 formatNumber 사용 ('원 원' 방지)
    cost_excl_vat: formatNumber(payment.costExclVat),
    amount: formatNumber(payment.amount),
    bank_name: nz(payment.bankName),
    account_number: nz(payment.accountNumber),
    account_holder: nz(payment.accountHolder),
    report_due_date: formatDate(payment.reportDueDate),
    ...consultingFields(meta),
    ...contractorFields(contractor),
    application_date: formatDate(new Date().toISOString()),
  };
}

/** 컨설팅 결과보고서 템플릿 key (공통) */
export const CONSULTING_REPORT_TEMPLATE_KEY = 'consulting_result_report';

export interface MentoringReportMeta {
  place?: string | null;
  topic?: string | null;
  consultantName?: string | null;
  difficulties?: string | null;
  result?: string | null;
}

/** 케이스 + 멘토링 일지 → 컨설팅 결과보고서 플레이스홀더 (50e07127 양식) */
export function buildMentoringReportData(
  caseRow: CaseRow,
  log: Pick<MentoringLog, 'visited_at' | 'content'>,
  meta?: MentoringReportMeta,
): Record<string, string | number | null> {
  return {
    business_name: caseRow.business_name,
    owner_name: caseRow.owner_name,
    visited_at: formatDate(log.visited_at),
    place: nz(meta?.place),
    topic: nz(meta?.topic),
    consultant_name: nz(meta?.consultantName),
    difficulties: nz(meta?.difficulties),
    content: log.content,
    result: nz(meta?.result),
    institution: INSTITUTION,
    report_date: formatDate(new Date().toISOString()),
  };
}

/** 서식 생성 대상 키 (사업신청서·추진계획서·동의·확약·확인 등) */
export const ATTACHMENT_FORM_KEYS = [
  'business_application',
  'business_plan',
  'consent_privacy',
  'consent_admin_info',
  'pledge_no_overlap',
  'pledge_warranty',
  'outdoor_ad_exempt',
  'cctv_policy',
  'change_request',
  'withdrawal_request',
] as const;

export type AttachmentFormKey = (typeof ATTACHMENT_FORM_KEYS)[number];

/** 케이스(+외주업체) 데이터 → 동의·확약·확인 서식 플레이스홀더 매핑 */
export function buildAttachmentData(
  caseRow: CaseRow,
  contractor: Contractor | null,
): Record<string, string | number | null> {
  return {
    business_name: caseRow.business_name,
    owner_name: caseRow.owner_name,
    business_reg_no: caseRow.business_reg_no,
    phone: caseRow.phone,
    address: caseRow.address,
    email: nz(caseRow.email),
    business_type: nz(caseRow.business_type),
    item: nz(caseRow.item),
    employee_count: caseRow.employee_count ?? '',
    opened_at: caseRow.opened_at ? formatDate(caseRow.opened_at) : '',
    revenue_last_year:
      caseRow.revenue_last_year != null
        ? Number(caseRow.revenue_last_year).toLocaleString('ko-KR')
        : '',
    ...contractorFields(contractor),
    institution: INSTITUTION,
    today: formatDate(new Date().toISOString()),
  };
}

/** 템플릿 key 로 HTML 템플릿 조회 */
export async function getTemplateHtml(templateKey: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('document_templates')
    .select('html_content')
    .eq('template_key', templateKey)
    .maybeSingle();
  return data?.html_content ?? null;
}
