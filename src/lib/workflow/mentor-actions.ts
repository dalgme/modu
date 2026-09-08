'use server';

import { revalidatePath } from 'next/cache';

import { mentorOrNull, mentorOfCaseOrNull, MENTOR_ONLY_ERROR, NOT_ASSIGNED_ERROR } from '@/lib/auth/guards';
import { getImpersonation } from '@/lib/auth/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { submitRound, updateRound, deleteRound, registerRoundReport, type RoundInput, type RoundReportInput, type RoundResult } from '@/lib/workflow/rounds';
import {
  normalizeObservation,
  requestClosure,
  requestMentorWithdrawal,
  requestRoundExtension,
  saveObservationDraft,
  uploadObservationFile,
} from '@/lib/workflow/closure';
import type { WorkflowResult } from '@/lib/workflow/cases';
import { saveMentorSignature } from '@/lib/documents/round-report';

function revalidate(caseId: string) {
  revalidatePath(`/mentor/cases/${caseId}`);
  revalidatePath('/mentor/dashboard');
  revalidatePath(`/nextlab/cases/${caseId}`);
  revalidatePath('/nextlab/dashboard');
  revalidatePath(`/institution/cases/${caseId}`);
}

/** 대행 중 감사 기록의 실행자를 실제 신원으로 남긴다 */
async function auditOnBehalf(action: string, caseId: string, mentorId: string, metadata: Record<string, unknown>): Promise<void> {
  const imp = await getImpersonation();
  if (!imp || imp.target.id !== mentorId) return;
  await createAdminClient().from('audit_logs').insert({
    actor_id: imp.actorId,
    action: `${action}.on_behalf`,
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { on_behalf_of: mentorId, via: 'view-as', ...metadata } as never,
  });
}

/** 멘토: 회차 1단계 등록 (계획/실행 — 일시·유형·참가자·장소) */
export async function submitRoundAction(input: Omit<RoundInput, 'mentorId'>): Promise<RoundResult> {
  const profile = await mentorOfCaseOrNull(input.caseId);
  if (!profile) return { ok: false, error: (await mentorOrNull()) ? NOT_ASSIGNED_ERROR : MENTOR_ONLY_ERROR };
  const result = await submitRound({ ...input, mentorId: profile.id });
  if (result.ok) {
    await auditOnBehalf('round.create', input.caseId, profile.id, { round_no: result.roundNo });
    revalidate(input.caseId);
  }
  return result;
}

/** 멘토: 회차 2단계 — 실서류(보고서) 등록 */
export async function registerRoundReportAction(input: { caseId: string } & Omit<RoundReportInput, 'mentorId'>): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(input.caseId);
  if (!profile) return { ok: false, error: (await mentorOrNull()) ? NOT_ASSIGNED_ERROR : MENTOR_ONLY_ERROR };
  const result = await registerRoundReport({ ...input, mentorId: profile.id });
  if (result.ok) {
    await auditOnBehalf('round.report', input.caseId, profile.id, { log_id: input.logId });
    revalidate(input.caseId);
  }
  return result;
}

/** 멘토: 회차 수정 */
export async function updateRoundAction(input: { caseId: string; logId: string; place?: string; topic?: string; content?: string; result?: string; photoPaths: string[] }): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(input.caseId);
  if (!profile) return { ok: false, error: NOT_ASSIGNED_ERROR };
  const result = await updateRound({ ...input, mentorId: profile.id });
  if (result.ok) revalidate(input.caseId);
  return result;
}

/** 멘토: 마지막 회차 삭제 */
export async function deleteRoundAction(caseId: string, logId: string): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(caseId);
  if (!profile) return { ok: false, error: NOT_ASSIGNED_ERROR };
  const result = await deleteRound(logId, profile.id);
  if (result.ok) revalidate(caseId);
  return result;
}

/** 멘토: 관찰의견서 임시 저장 */
export async function saveObservationAction(caseId: string, raw: unknown): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(caseId);
  if (!profile) return { ok: false, error: NOT_ASSIGNED_ERROR };
  const result = await saveObservationDraft(caseId, profile.id, normalizeObservation(raw));
  if (result.ok) revalidate(caseId);
  return result;
}

/** 멘토: 관찰의견서 완성본 파일 업로드 */
export async function uploadObservationAction(caseId: string, staging: { stagingPath: string; fileName: string; mimeType: string }): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(caseId);
  if (!profile) return { ok: false, error: NOT_ASSIGNED_ERROR };
  const result = await uploadObservationFile(caseId, profile.id, staging);
  if (result.ok) revalidate(caseId);
  return result;
}

/** 멘토: 종결 요청 (T5) */
export async function requestClosureAction(caseId: string): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(caseId);
  if (!profile) return { ok: false, error: NOT_ASSIGNED_ERROR };
  const result = await requestClosure(caseId, profile.id);
  if (result.ok) {
    await auditOnBehalf('case.closure_requested', caseId, profile.id, {});
    revalidate(caseId);
  }
  return result;
}

/** 멘토: 추가 회차 요청 */
export async function requestExtensionAction(caseId: string, reason: string, extraRounds: number): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(caseId);
  if (!profile) return { ok: false, error: NOT_ASSIGNED_ERROR };
  const result = await requestRoundExtension(caseId, profile.id, reason, extraRounds);
  if (result.ok) revalidate(caseId);
  return result;
}

/** 멘토: 중도 종료 요청 (T11a) */
export async function requestWithdrawalAction(caseId: string, reason: string): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(caseId);
  if (!profile) return { ok: false, error: NOT_ASSIGNED_ERROR };
  const result = await requestMentorWithdrawal(caseId, profile.id, reason);
  if (result.ok) revalidate(caseId);
  return result;
}

/** 멘토: 내 서명 등록/교체 (보고서 자동 서명용). 대행 중에는 불가. */
export async function saveMentorSignatureAction(dataUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await mentorOrNull();
  if (!profile) return { ok: false, error: MENTOR_ONLY_ERROR };
  const imp = await getImpersonation();
  if (imp && imp.target.id === profile.id) return { ok: false, error: '대행 중에는 서명을 등록할 수 없습니다. 멘토 본인이 등록해야 합니다.' };
  const r = await saveMentorSignature(profile.id, dataUrl);
  if (r.ok) revalidatePath('/mentor/signature');
  return r;
}
