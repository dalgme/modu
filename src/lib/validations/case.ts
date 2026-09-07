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
 * 멘티(케이스) 등록. 사업그룹(support_type_id)은 행사 컨텍스트 안의 그룹이어야 한다(서버 검증).
 * 예비창업자는 사업자번호·주소가 없을 수 있어 선택이다.
 */
export const caseFormSchema = z.object({
  support_type_id: z.string().uuid('사업그룹을 선택하세요.'),
  business_name: z.string().trim().min(1, '기업(팀)명을 입력하세요.'),
  owner_name: z.string().trim().min(1, '멘티(대표자) 이름을 입력하세요.'),
  business_reg_no: optionalString,
  phone: z.string().trim().min(1, '연락처를 입력하세요.'),
  address: optionalString,
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
