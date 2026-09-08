'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { realRoleOrNull, mentorOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { getImpersonation } from '@/lib/auth/impersonation';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateRecommendations, type RecommendationItem } from '@/lib/matching/recommend';

type Result = { ok: true } | { ok: false; error: string };
const OPERATOR_ONLY = '운영사 담당자만 실행할 수 있습니다.';

async function operatorCase(caseId: string): Promise<{ id: string; programId: string } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.assign');
  if (denied) return { error: denied };
  const { data } = await createAdminClient().from('cases').select('program_id').eq('id', caseId).maybeSingle();
  if (!data || data.program_id !== ctx.programId) return { error: '이 행사의 케이스가 아닙니다.' };
  return { id: profile.id, programId: ctx.programId };
}

/** 운영사: 멘토 추천 생성/재생성 */
export async function recommendMentorsAction(caseId: string): Promise<{ ok: true; items: RecommendationItem[]; usedModel: boolean } | { ok: false; error: string }> {
  const op = await operatorCase(caseId);
  if ('error' in op) return { ok: false, error: op.error };
  const r = await generateRecommendations(caseId, op.id);
  if (r.ok) revalidatePath(`/nextlab/cases/${caseId}`);
  return r;
}

const list = z.array(z.string().trim().min(1).max(40)).max(30).default([]);
const menteeProfileSchema = z.object({
  industry: z.string().trim().optional().transform((v) => v || null),
  stage: z.string().trim().optional().transform((v) => v || null),
  region: z.string().trim().optional().transform((v) => v || null),
  preferred_mode: z.enum(['online', 'offline', '']).optional().transform((v) => v || null),
  needs: list,
  keywords: list,
  summary: z.string().trim().max(2000).optional().transform((v) => v || null),
});

/** 운영사: 멘티 프로필(매칭 키워드) 저장 */
export async function saveMenteeProfileAction(caseId: string, input: unknown): Promise<Result> {
  const op = await operatorCase(caseId);
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = menteeProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const { error } = await createAdminClient().from('mentee_profiles').upsert({ case_id: caseId, program_id: op.programId, ...parsed.data }, { onConflict: 'case_id' });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/nextlab/cases/${caseId}`);
  return { ok: true };
}

const mentorProfileSchema = z.object({
  industries: list,
  expertise: list,
  regions: list,
  stages: list,
  modes: z.array(z.enum(['online', 'offline'])).min(1, '가능한 유형을 1개 이상 선택하세요.'),
  capacity: z.coerce.number().int().min(0).max(100).default(5),
  career: z.string().trim().max(2000).optional().transform((v) => v || null),
  bio: z.string().trim().max(2000).optional().transform((v) => v || null),
  keywords: list,
});

/** 멘토 본인(현재 행사) 또는 운영사: 멘토 프로필 저장 */
export async function saveMentorProfileAction(programId: string, mentorId: string, input: unknown): Promise<Result> {
  const parsed = mentorProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const staff = await realRoleOrNull(['nextlab']);
  const ctx = staff ? await contextOrNull(staff) : null;
  let allowed = !!ctx && ctx.programId === programId;
  if (!allowed) {
    const me = await mentorOrNull();
    const imp = await getImpersonation();
    if (me && me.id === mentorId && !(imp && imp.target.id === mentorId)) {
      const myCtx = await contextOrNull(me);
      allowed = !!myCtx && myCtx.programId === programId;
    }
  }
  if (!allowed) return { ok: false, error: '본인 프로필만 수정할 수 있습니다(대행 불가).' };
  const { error } = await createAdminClient().from('mentor_profiles').upsert({ program_id: programId, user_id: mentorId, ...parsed.data }, { onConflict: 'program_id,user_id' });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/mentor/profile');
  revalidatePath('/nextlab/mentors');
  return { ok: true };
}
