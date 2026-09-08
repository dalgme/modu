'use server';

import { revalidatePath } from 'next/cache';

import { roleOrNull, realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { decideMentorChange, requestMentorChange, signRound, submitSurvey } from '@/lib/workflow/mentee';
import type { WorkflowResult } from '@/lib/workflow/cases';

const MENTEE_ONLY = '멘티 본인만 실행할 수 있습니다.';

function revalidate(caseId: string) {
  for (const p of ['/mentee/dashboard', '/mentee/rounds', '/mentee/survey', `/mentor/cases/${caseId}`, `/nextlab/cases/${caseId}`, `/institution/cases/${caseId}`, '/nextlab/dashboard']) revalidatePath(p);
}

/** 멘티 본인 케이스인지 (대행 중에는 명의 = 멘티) */
async function menteeOfCase(caseId: string): Promise<{ id: string; name: string } | null> {
  const profile = await roleOrNull(['mentee']);
  if (!profile) return null;
  const { data } = await createAdminClient().from('cases').select('id').eq('id', caseId).eq('mentee_id', profile.id).maybeSingle();
  return data ? { id: profile.id, name: profile.name } : null;
}

export async function signRoundAction(caseId: string, logId: string, dataUrl: string): Promise<WorkflowResult> {
  const mentee = await menteeOfCase(caseId);
  if (!mentee) return { ok: false, error: MENTEE_ONLY };
  const r = await signRound(caseId, logId, mentee, dataUrl);
  if (r.ok) revalidate(caseId);
  return r;
}

export async function submitSurveyAction(caseId: string, answers: Record<string, unknown>): Promise<WorkflowResult> {
  const mentee = await menteeOfCase(caseId);
  if (!mentee) return { ok: false, error: MENTEE_ONLY };
  const r = await submitSurvey(caseId, mentee.id, answers ?? {});
  if (r.ok) revalidate(caseId);
  return r;
}

export async function requestMentorChangeAction(caseId: string, reason: string): Promise<WorkflowResult> {
  const mentee = await menteeOfCase(caseId);
  if (!mentee) return { ok: false, error: MENTEE_ONLY };
  const r = await requestMentorChange(caseId, mentee.id, reason ?? '');
  if (r.ok) revalidate(caseId);
  return r;
}

/** 운영사: 멘토 변경 요청 수락(새 멘토 지정)/반려 */
export async function decideMentorChangeAction(requestId: string, decision: 'accepted' | 'rejected', note: string, newMentorId?: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  { const denied = denyUnless(ctx, 'review'); if (denied) return { ok: false, error: denied }; }
  const admin = createAdminClient();
  const { data: req } = await admin.from('mentor_change_requests').select('case_id, cases!inner(program_id)').eq('id', requestId).maybeSingle();
  const program = (req?.cases as unknown as { program_id: string } | null)?.program_id;
  if (!req || program !== ctx.programId) return { ok: false, error: '이 행사의 요청이 아닙니다.' };
  const r = await decideMentorChange(requestId, profile.id, decision, note ?? '', newMentorId);
  if (r.ok) revalidate(r.caseId);
  return r;
}
