import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

// 빈 문자열 → undefined 로 정규화하는 선택 숫자
const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === '' || v === undefined || v === null) return undefined;
    // 화면 입력에 콤마가 포함될 수 있으므로 제거 후 파싱
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : undefined;
  });

/**
 * 케이스 등록 (접수신청서 붙임1 기준).
 * 폐업정리 전용 필드는 선택으로 두고, 서버에서 유형이 closure 일 때 필수 검증한다.
 * 자격심사·선정 로직은 포함하지 않는다 (진흥원 별도 처리).
 */
export const caseFormSchema = z.object({
  support_type_id: z.string().uuid('지원유형을 선택하세요.'),
  business_name: z.string().trim().min(1, '업체명을 입력하세요.'),
  owner_name: z.string().trim().min(1, '대표자명을 입력하세요.'),
  business_reg_no: z.string().trim().min(10, '사업자등록번호를 정확히 입력하세요.').max(12),
  phone: z.string().trim().min(1, '연락처를 입력하세요.'),
  address: z.string().trim().min(1, '사업장 주소를 입력하세요.'),
  email: z
    .string()
    .trim()
    .email('올바른 이메일을 입력하세요.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  business_type: optionalString,
  item: optionalString,
  opened_at: optionalString,
  employee_count: optionalNumber,

  // 폐업정리 전용
  closure_status: z.enum(['closed', 'pending']).optional(),
  closed_at: optionalString,
  revenue_last_year: optionalNumber,
  lease_deposit: optionalNumber,
  monthly_rent: optionalNumber,
  exclusive_area_pyeong: optionalNumber,
});

/** 변환 후(출력) 타입 — 서버 처리·DB insert 용 */
export type CaseFormInput = z.output<typeof caseFormSchema>;
/** 변환 전(입력) 타입 — react-hook-form 필드 값 */
export type CaseFormValues = z.input<typeof caseFormSchema>;

/** 멘토 배정 */
export const assignMentorSchema = z.object({
  caseId: z.string().uuid(),
  mentorId: z.string().uuid('멘토를 선택하세요.'),
});
