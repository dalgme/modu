'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';

import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { assignMentorSchema, caseFormSchema } from '@/lib/validations/case';
import { markRecommendationAdopted } from '@/lib/matching/recommend';
import { afterAssignmentConfirmed, autoMatchMentee, rebalanceAllOpenRecommendations } from '@/lib/matching/auto-match';
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
  // 추천 목록에 있던 멘토를 채택했으면 매칭 방식 = 추천 (P27-08). 아니면 assignMentor 기본값(수동) 유지.
  const admin = createAdminClient();
  if (rank !== null && rank !== undefined) {
    const { error } = await admin.from('mentor_assignments').update({ match_method: 'recommended' }).eq('case_id', caseId).eq('mentor_id', mentorId).eq('is_active', true);
    if (error) console.error('match_method update failed:', error.message);
  }
  const { error: auditError } = await admin.from('audit_logs').insert({ actor_id: actorId, program_id: programId, action: 'match.adoption', entity_type: 'cases', entity_id: caseId, metadata: { mentor_id: mentorId, recommended_rank: rank } });
  if (auditError) console.error('adoption audit failed:', auditError.message);
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
    // 프로필 저장 실패로 등록 자체를 실패 처리하면 재제출 시 케이스가 중복 생성된다 —
    // 케이스는 이미 만들어졌으므로 성공으로 두고, 프로필은 케이스 상세에서 보완 입력한다.
    if (profileError) console.error('mentee profile upsert failed (case created):', profileError.message);
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

/** 운영사: 멘토 교체 (T3). expectedCurrentMentorId = 화면이 알고 있던 현재 멘토(동시 변경 감지) */
export async function reassignMentorAction(caseId: string, newMentorId: string, reason?: string, expectedCurrentMentorId?: string | null): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'case.assign'); if (denied) return { ok: false, error: denied }; }
  const parsed = assignMentorSchema.safeParse({ caseId, mentorId: newMentorId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  if (!(await caseInProgram(parsed.data.caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };

  const result = await reassignMentor(parsed.data.caseId, parsed.data.mentorId, profile.id, reason, 'manual', expectedCurrentMentorId ? { expectedCurrentMentorId } : {});
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
  if (result.ok) {
    // 회수된 멘토가 다시 후보가 되므로 미배정 멘티 추천 재계산 (실패해도 회수는 유지)
    try {
      await rebalanceAllOpenRecommendations(ctx.programId, profile.id);
    } catch (err) {
      console.error('rebalance after recall failed:', err instanceof Error ? err.message : err);
    }
    revalidatePath('/nextlab/roster');
    revalidateCase(caseId);
  }
  return result;
}

/**
 * 운영사: 케이스 내부 메모 (append-only) — audit_logs 행(action='case.memo')으로 저장한다. 케이스 상세 [조치 이력] 카드에 작성자·시각과 함께 나온다.
 */
export async function addCaseMemoAction(caseId: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'case.manage'); if (denied) return { ok: false, error: denied }; }
  const text = (body ?? '').trim();
  if (!text) return { ok: false, error: '메모 내용을 입력하세요.' };
  if (text.length > 1000) return { ok: false, error: '메모는 1,000자 이내로 입력하세요.' };
  if (!(await caseInProgram(caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  const { error } = await createAdminClient().from('audit_logs').insert({
    actor_id: profile.id,
    program_id: ctx.programId,
    action: 'case.memo',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { body: text },
  });
  if (error) {
    console.error('case memo insert failed:', error.message);
    return { ok: false, error: `메모 저장 실패: ${error.message}` };
  }
  revalidatePath(`/nextlab/cases/${caseId}`);
  return { ok: true };
}
