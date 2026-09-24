'use server';

import { revalidatePath } from 'next/cache';

import { mentorOrNull, mentorOfCaseOrNull, getRealSessionProfile, MENTOR_ONLY_ERROR, NOT_ASSIGNED_ERROR } from '@/lib/auth/guards';
import { getImpersonation } from '@/lib/auth/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { submitRound, updateRound, deleteRound, updatePlannedRound, deletePlannedRound, registerRoundReport, type RoundInput, type RoundReportInput, type RoundResult } from '@/lib/workflow/rounds';
import type { ConsultingMode } from '@/lib/settlement/rates';
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

/** 멘토: 회차 1단계 등록 (계획/실행 — 일시·유형·참가자·장소) */
export async function submitRoundAction(input: Omit<RoundInput, 'mentorId'>): Promise<RoundResult> {
  const profile = await mentorOfCaseOrNull(input.caseId);
  if (!profile) return { ok: false, error: (await mentorOrNull()) ? NOT_ASSIGNED_ERROR : MENTOR_ONLY_ERROR };
  const result = await submitRound({ ...input, mentorId: profile.id });
  if (result.ok) revalidate(input.caseId);
  return result;
}

/** 멘토: 회차 2단계 — 실서류(보고서) 등록 */
export async function registerRoundReportAction(input: { caseId: string } & Omit<RoundReportInput, 'mentorId'>): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(input.caseId);
  if (!profile) return { ok: false, error: (await mentorOrNull()) ? NOT_ASSIGNED_ERROR : MENTOR_ONLY_ERROR };
  const result = await registerRoundReport({ ...input, mentorId: profile.id });
  if (result.ok) revalidate(input.caseId);
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

/** 멘토: 계획(미보고) 회차 일정 수정 — 일자·시각·유형·장소 (P20) */
export async function updatePlannedRoundAction(input: { caseId: string; logId: string; mode: ConsultingMode; startedAt: string; endedAt: string; place?: string }): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(input.caseId);
  if (!profile) return { ok: false, error: NOT_ASSIGNED_ERROR };
  const result = await updatePlannedRound({ ...input, mentorId: profile.id });
  if (result.ok) revalidate(input.caseId);
  return result;
}

/** 멘토: 계획(미보고) 회차 삭제 — 마지막이 아니어도 가능, 뒤 번호를 당긴다 (P20) */
export async function deletePlannedRoundAction(caseId: string, logId: string): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(caseId);
  if (!profile) return { ok: false, error: NOT_ASSIGNED_ERROR };
  const result = await deletePlannedRound(logId, profile.id, caseId);
  if (result.ok) revalidate(caseId);
  return result;
}

/** 멘토: 마지막 회차 삭제 */
export async function deleteRoundAction(caseId: string, logId: string): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(caseId);
  if (!profile) return { ok: false, error: NOT_ASSIGNED_ERROR };
  const result = await deleteRound(logId, profile.id, caseId);
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
  if (result.ok) revalidate(caseId);
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

/**
 * 멘토: 멘티 현장 서명 수집 (P20) — 멘토 단말(스마트폰) 터치로 멘티가 직접 서명한다.
 * 서명 자체는 멘티 명의(signatures.signer_type = mentee), 감사 실행자는 멘토로 남는다.
 * 운영사가 멘토 대행 중이면 허용하되 감사 실행자는 **실제 담당자**(getRealSessionProfile)로, metadata 에 on_behalf_of·collected_by_operator·via 를 남긴다 (P31).
 */
export async function collectRoundSignatureAction(caseId: string, logId: string, dataUrl: string): Promise<WorkflowResult> {
  const profile = await mentorOfCaseOrNull(caseId);
  if (!profile) return { ok: false, error: NOT_ASSIGNED_ERROR };
  const imp = await getImpersonation();
  const real = imp && imp.target.id === profile.id ? await getRealSessionProfile() : null;
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('mentee_id').eq('id', caseId).maybeSingle();
  if (!c?.mentee_id) return { ok: false, error: '멘티 계정이 아직 연결되지 않았습니다.' };
  const { data: mentee } = await admin.from('users').select('id, name').eq('id', c.mentee_id).maybeSingle();
  if (!mentee) return { ok: false, error: '멘티 계정을 찾을 수 없습니다.' };
  const { signRound } = await import('@/lib/workflow/mentee');
  const result = await signRound(caseId, logId, mentee, dataUrl, { collectedBy: { id: profile.id, operatorActorId: real?.id ?? null } });
  if (result.ok) revalidate(caseId);
  return result;
}
