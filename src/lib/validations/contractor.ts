import { z } from 'zod';

const optionalNum = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === '' || v === undefined || v === null) return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  });

export const contractorSchema = z.object({
  caseId: z.string().uuid(),
  company_name: z.string().trim().min(1, '업체명을 입력하세요.'),
  business_reg_no: z.string().trim().optional(),
  representative: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  work_type: z.string().trim().optional(),
  estimate_amount: optionalNum,
});

export type ContractorInput = z.infer<typeof contractorSchema>;
