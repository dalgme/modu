import { z } from 'zod';

export const paymentApplicationSchema = z.object({
  caseId: z.string().uuid(),
  bank_name: z.string().trim().min(1, '은행명을 입력하세요.'),
  account_number: z.string().trim().min(1, '계좌번호를 입력하세요.'),
  account_holder: z.string().trim().min(1, '예금주를 입력하세요.'),
  amount: z.coerce.number().min(0, '지급 금액을 입력하세요.'),
  account_confirmed: z.literal(true, {
    message: '지급계좌가 대표자 본인 명의임을 확인해야 합니다.',
  }),
});
export type PaymentApplicationInput = z.infer<typeof paymentApplicationSchema>;

export const paymentApprovalSchema = z
  .object({
    caseId: z.string().uuid(),
    result: z.enum(['approved', 'rejected']),
    reason: z.string().trim().optional(),
  })
  .refine((v) => v.result !== 'rejected' || (v.reason && v.reason.length > 0), {
    message: '반려 시 사유를 입력해야 합니다.',
    path: ['reason'],
  });
export type PaymentApprovalInput = z.infer<typeof paymentApprovalSchema>;
