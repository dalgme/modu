'use server';

import { revalidatePath } from 'next/cache';

import { requireNextlab, requireInstitution } from '@/lib/auth/guards';
import { paymentApplicationSchema, paymentApprovalSchema } from '@/lib/validations/payment';
import { draftPaymentApplication, approvePayment } from '@/lib/workflow/payment';
import type { WorkflowResult } from '@/lib/workflow/cases';

// 멘티 시공·지급증빙 등록(구 submitExecutionDocsAction)은 자금신청(사후) 신청단위 시스템
// (submitPostSupportAction)으로 일원화되어 제거되었다.

/** 넥스트랩: 지급신청서 작성 (10단계) */
export async function draftPaymentAction(input: unknown): Promise<WorkflowResult> {
  const profile = await requireNextlab();
  const parsed = paymentApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }
  const result = await draftPaymentApplication({
    caseId: parsed.data.caseId,
    drafterId: profile.id,
    bankName: parsed.data.bank_name,
    accountNumber: parsed.data.account_number,
    accountHolder: parsed.data.account_holder,
    amount: parsed.data.amount,
  });
  if (result.ok) revalidatePath(`/nextlab/cases/${parsed.data.caseId}`);
  return result;
}

/** 진흥원: 지급승인/반려 (11단계) */
export async function paymentApprovalAction(input: unknown): Promise<WorkflowResult> {
  const profile = await requireInstitution();
  const parsed = paymentApprovalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }
  const result = await approvePayment(
    parsed.data.caseId,
    profile.id,
    parsed.data.result,
    parsed.data.reason,
  );
  if (result.ok) revalidatePath(`/institution/cases/${parsed.data.caseId}`);
  return result;
}
