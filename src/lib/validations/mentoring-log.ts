import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

export const mentoringLogSchema = z.object({
  caseId: z.string().uuid(),
  visitedAt: z.string().min(1, '방문 일시를 입력하세요.'),
  durationMinutes: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === '' || v === undefined || v === null) return undefined;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
    }),
  place: optionalText,
  topic: optionalText,
  difficulties: optionalText,
  content: z.string().trim().min(1, '컨설팅 내용을 입력하세요.'),
  result: optionalText,
});

export type MentoringLogInput = z.infer<typeof mentoringLogSchema>;
