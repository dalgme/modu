import { z } from 'zod';

const optionalAmount = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === '' || v === undefined || v === null) return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  });

export const applicationContentSchema = z.object({
  caseId: z.string().uuid(),
  reason: z.string().trim().min(1, '신청 사유·사업내용을 입력하세요.'),
  requested_amount: optionalAmount,
  cost_excl_vat: optionalAmount,
  categories: z.array(z.enum(['hygiene', 'safety', 'promo', 'env', 'pos'])).optional().default([]),
  // 붙임5 5.추진계획 서술 (선택 입력 → PDF 자동 채움)
  plan_intro: z.string().trim().optional(),
  plan_status: z.string().trim().optional(),
  plan_need: z.string().trim().optional(),
  plan_effect: z.string().trim().optional(),
  // 붙임5 4.시공(제작)내용 — 멘티 공사업체 등록값 자동 프리필 + 멘토 편집
  construction_company: z.string().trim().optional(),
  construction_region: z.string().trim().optional(),
  construction_reg_no: z.string().trim().optional(),
  construction_rep: z.string().trim().optional(),
  construction_biztype: z.string().trim().optional(),
  construction_phone: z.string().trim().optional(),
  construction_mobile: z.string().trim().optional(),
  construction_period: z.string().trim().optional(),
  construction_content: z.string().trim().optional(),
});
export type ApplicationContentInput = z.infer<typeof applicationContentSchema>;

export const reviewSchema = z.object({
  caseId: z.string().uuid(),
  result: z.enum(['approved', 'revision_requested']),
  comment: z.string().trim().optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const approvalSchema = z
  .object({
    caseId: z.string().uuid(),
    result: z.enum(['approved', 'rejected']),
    reason: z.string().trim().optional(),
  })
  .refine((v) => v.result !== 'rejected' || (v.reason && v.reason.length > 0), {
    message: '반려 시 사유를 입력해야 합니다.',
    path: ['reason'],
  });
export type ApprovalInput = z.infer<typeof approvalSchema>;
