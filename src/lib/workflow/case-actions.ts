'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';

import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { assignMentorSchema, caseFormSchema } from '@/lib/validations/case';
import { succeedCases, type SuccessionResult } from '@/lib/workflow/succession';
import { markRecommendationAdopted } from '@/lib/matching/recommend';
import { afterAssignmentConfirmed, autoMatchMentee } from '@/lib/matching/auto-match';
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

/** 추천 채택 기록 (docs §14-3): 추천 목록에 있던 멘토면 adopted_at, 아니면 recommended_rank: null 을 감사에 남긴다 */
async function recordAdoption(caseId: string, mentorId: string, actorId: string, programId: string): Promise<void> {
  const rank = await markRecommendationAdopted(caseId, mentorId);
  await createAdminClient().from('audit_logs').insert({ actor_id: actorId, program_id: programId, action: 'match.adoption', entity_type: 'cases', entity_id: caseId, metadata: { mentor_id: mentorId, recommended_rank: rank } });
}

/** 운영사: 멘티(케이스) 등록 (T1) — P23 컬럼 재정의: 닉네임·고유번호·권역·유형·희망분야·재배치 희망·비고를 프로필에 함께 저장 */
export async function registerCaseAction(input: unknown): Promise<CreateCaseResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'case.manage'); if (denied) return { ok: false, error: denied }; }
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : '');
  // 닉네임(팀명·활동명)이 "이름/소속" 표기의 소속 자리 — 기업(팀)명 컬럼 폐지, 비우면 이름
  const parsed = caseFormSchema.safeParse({ ...raw, business_name: str('business_name') || str('nickname') || str('owner_name') });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };

  const result = await createCase({ ...parsed.data, programId: ctx.programId, createdBy: profile.id });
  if (result.ok) {
    const needs = str('needs').split(/[;,]/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
    const { error: profileError } = await createAdminClient().from('mentee_profiles').upsert(
      {
        case_id: result.caseId,
        program_id: ctx.programId,
        nickname: str('nickname') || null,
        external_no: str('external_no') || null,
        region: str('region') || null,
        mentee_type: str('mentee_type') || null,
        needs,
        preferred_mentor: str('preferred_mentor') || null,
        note: str('note') || null,
      },
      { onConflict: 'case_id' },
    );
    if (profileError) return { ok: false, error: `케이스는 등록됐지만 프로필 저장에 실패했습니다: ${profileError.message}` };
    // P24 자동 매칭 — 실패해도 등록을 막지 않는다
    try {
      await autoMatchMentee(result.caseId, profile.id);
    } catch (err) {
      console.error('auto match on register failed:', err instanceof Error ? err.message : err);
    }
    revalidatePath('/nextlab/dashboard');
    revalidatePath('/nextlab/roster');
  }
  return result;
}

/** 운영사: 멘토 배정 (T2/T12) */
export async function assignMentorAction(caseId: string, mentorId: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'case.assign'); if (denied) return { ok: false, error: denied }; }
  const parsed = assignMentorSchema.safeParse({ caseId, mentorId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  if (!(await caseInProgram(parsed.data.caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };

  const result = await assignMentor(parsed.data.caseId, parsed.data.mentorId, profile.id);
  if (result.ok) {
    await recordAdoption(parsed.data.caseId, parsed.data.mentorId, profile.id, ctx.programId);
    await afterAssignmentConfirmed(ctx.programId, parsed.data.mentorId, profile.id);
    revalidateCase(caseId);
  }
  return result;
}

/** 운영사: 멘토 교체 (T3) */
export async function reassignMentorAction(caseId: string, newMentorId: string, reason?: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'case.assign'); if (denied) return { ok: false, error: denied }; }
  const parsed = assignMentorSchema.safeParse({ caseId, mentorId: newMentorId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  if (!(await caseInProgram(parsed.data.caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };

  const result = await reassignMentor(parsed.data.caseId, parsed.data.mentorId, profile.id, reason);
  if (result.ok) {
    await recordAdoption(parsed.data.caseId, parsed.data.mentorId, profile.id, ctx.programId);
    await afterAssignmentConfirmed(ctx.programId, parsed.data.mentorId, profile.id);
    revalidateCase(caseId);
  }
  return result;
}

/** 운영사: 멘토 배정 회수 (회차 없을 때만) */
export async function recallMentorAction(caseId: string, reason?: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'case.assign'); if (denied) return { ok: false, error: denied }; }
  if (!(await caseInProgram(caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };

  const result = await recallMentor(caseId, profile.id, reason);
  if (result.ok) revalidateCase(caseId);
  return result;
}

/** 운영사: 그룹 간 승계 개설 (docs §8) */
export async function succeedCasesAction(input: { sourceCaseIds: string[]; targetGroupId: string; keepMentor: boolean }): Promise<{ ok: true; result: SuccessionResult } | { ok: false; error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'case.manage'); if (denied) return { ok: false, error: denied }; }
  const r = await succeedCases({ programId: ctx.programId, actorId: profile.id, sourceCaseIds: input.sourceCaseIds ?? [], targetGroupId: input.targetGroupId, keepMentor: !!input.keepMentor });
  if (r.ok) {
    revalidatePath('/nextlab/dashboard');
    revalidatePath('/nextlab/succession');
  }
  return r;
}
