'use server';

import { revalidatePath } from 'next/cache';

import { requireStaff, requireInstitution } from '@/lib/auth/guards';
import {
  withdrawCase,
  recordChangeApproval,
  markNotified,
  manualReceiveApplication,
} from '@/lib/workflow/case-lifecycle';
import type { WorkflowResult } from '@/lib/workflow/cases';

function revalidateCase(caseId: string) {
  revalidatePath(`/nextlab/cases/${caseId}`);
  revalidatePath(`/institution/cases/${caseId}`);
  revalidatePath('/nextlab/dashboard');
  revalidatePath('/institution/dashboard');
}

/** 종료/포기 처리 (넥스트랩·진흥원) — 멘토 배정을 이력만 남기고 자동 연동에서 제외(종결) */
export async function withdrawCaseAction(caseId: string, reason: string): Promise<WorkflowResult> {
  const profile = await requireStaff();
  const result = await withdrawCase(caseId, profile.id, reason);
  if (result.ok) revalidateCase(caseId);
  return result;
}

/** 사업 변경 승인 기록 (붙임11) — 변경 '승인'은 진흥원(자금 권한자) 전용 */
export async function changeApprovalAction(caseId: string, note: string): Promise<WorkflowResult> {
  const profile = await requireInstitution();
  const result = await recordChangeApproval(caseId, profile.id, note);
  if (result.ok) revalidateCase(caseId);
  return result;
}

/** 승인 통보 완료 수동 처리 (진흥원·넥스트랩) — 알림 채널 미설정/실패 시 파이프라인 진행용 */
export async function markNotifiedAction(caseId: string): Promise<WorkflowResult> {
  const profile = await requireStaff();
  const result = await markNotified(caseId, profile.id);
  if (result.ok) revalidateCase(caseId);
  return result;
}

/** 지원신청서 수동 접수 (진흥원·넥스트랩) — 오프라인 제출 건을 검수 완료로 전이 */
export async function manualReceiveApplicationAction(caseId: string): Promise<WorkflowResult> {
  const profile = await requireStaff();
  const result = await manualReceiveApplication(caseId, profile.id);
  if (result.ok) {
    revalidateCase(caseId);
    revalidatePath('/nextlab/dashboard');
    revalidatePath('/institution/dashboard');
  }
  return result;
}
