'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { assignMentorSchema, caseFormSchema } from '@/lib/validations/case';
import {
  assignMentor,
  createCase,
  reassignMentor,
  recallMentor,
  type CreateCaseResult,
  type WorkflowResult,
} from '@/lib/workflow/cases';

const OPERATOR_ONLY = '운영사 담당자만 실행할 수 있습니다.';
const NO_CONTEXT = '행사를 먼저 선택하세요.';

function revalidateCase(caseId: string) {
  revalidatePath('/nextlab/dashboard');
  revalidatePath(`/nextlab/cases/${caseId}`);
  revalidatePath('/institution/dashboard');
  revalidatePath(`/institution/cases/${caseId}`);
  revalidatePath('/mentor/dashboard');
  revalidatePath(`/mentor/cases/${caseId}`);
}

/** 케이스가 현재 컨텍스트 행사 소속인지 (다른 행사 케이스 조작 차단) */
async function caseInProgram(caseId: string, programId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('cases').select('program_id').eq('id', caseId).maybeSingle();
  return !!data && data.program_id === programId;
}

/** 운영사: 멘티(케이스) 등록 (T1) */
export async function registerCaseAction(input: unknown): Promise<CreateCaseResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  const parsed = caseFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };

  const result = await createCase({ ...parsed.data, programId: ctx.programId, createdBy: profile.id });
  if (result.ok) revalidatePath('/nextlab/dashboard');
  return result;
}

/** 운영사: 멘토 배정 (T2/T12) */
export async function assignMentorAction(caseId: string, mentorId: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  const parsed = assignMentorSchema.safeParse({ caseId, mentorId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  if (!(await caseInProgram(parsed.data.caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };

  const result = await assignMentor(parsed.data.caseId, parsed.data.mentorId, profile.id);
  if (result.ok) revalidateCase(caseId);
  return result;
}

/** 운영사: 멘토 교체 (T3) */
export async function reassignMentorAction(caseId: string, newMentorId: string, reason?: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  const parsed = assignMentorSchema.safeParse({ caseId, mentorId: newMentorId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  if (!(await caseInProgram(parsed.data.caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };

  const result = await reassignMentor(parsed.data.caseId, parsed.data.mentorId, profile.id, reason);
  if (result.ok) revalidateCase(caseId);
  return result;
}

/** 운영사: 멘토 배정 회수 (회차 없을 때만) */
export async function recallMentorAction(caseId: string, reason?: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  if (!(await caseInProgram(caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };

  const result = await recallMentor(caseId, profile.id, reason);
  if (result.ok) revalidateCase(caseId);
  return result;
}
