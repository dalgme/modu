import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, '이메일 또는 휴대폰 번호를 입력하세요.'),
  password: z.string().min(1, '비밀번호를 입력하세요.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: '비밀번호가 일치하지 않습니다.',
    path: ['confirm'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** 관리자 계정 발급 (발주처/운영사/멘토) */
export const createAccountSchema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요.'),
  name: z.string().min(1, '이름을 입력하세요.'),
  phone: z.string().optional(),
  role: z.enum(['institution', 'nextlab', 'mentor']),
  position: z.string().trim().max(60).optional(),
  organization: z.string().trim().max(80).optional(),
}).refine((v) => v.role === 'mentor' || !!v.position?.trim(), { message: '발주처·운영사 담당자는 직위를 입력하세요.', path: ['position'] });
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

/** 멘티 초대 (케이스 등록 후 운영사가 계정 발급) */
export const inviteMenteeSchema = z.object({
  caseId: z.string().uuid('케이스를 확인할 수 없습니다.'),
  email: z.string().email('올바른 이메일을 입력하세요.'),
  name: z.string().min(1, '이름을 입력하세요.'),
  phone: z.string().optional(),
});
export type InviteMenteeInput = z.infer<typeof inviteMenteeSchema>;
