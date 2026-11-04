'use server';

import { revalidatePath } from 'next/cache';

import { mentorOrNull, MENTOR_ONLY_ERROR } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import type { ConsultingMode } from '@/lib/settlement/rates';
import { createGroupSession, deleteGroupSession, updateGroupSession } from '@/lib/workflow/group-mentoring';

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function mentorCtx(): Promise<{ id: string; programId: string } | { error: string }> {
  const profile = await mentorOrNull();
  if (!profile) return { error: MENTOR_ONLY_ERROR };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  return { id: profile.id, programId: ctx.programId };
}

function revalidate(caseIds: string[] = []) {
  revalidatePath('/mentor/group-mentoring');
  revalidatePath('/mentor/dashboard');
  revalidatePath('/mentor/schedule');
  for (const id of caseIds) {
    revalidatePath(`/mentor/cases/${id}`);
    revalidatePath(`/nextlab/cases/${id}`);
  }
}

/** 멘토: 그룹멘토링 일정 등록 — 내가 매칭된 이 라운드 멘티 2명 이상 */
export async function createGroupSessionAction(input: { supportTypeId: string; caseIds: string[]; mode: ConsultingMode; startedAt: string; endedAt: string; place?: string }): Promise<Result> {
  const m = await mentorCtx();
  if ('error' in m) return { ok: false, error: m.error };
  const r = await createGroupSession({ ...input, mentorId: m.id, programId: m.programId });
  if (!r.ok) return r;
  revalidate(input.caseIds);
  return { ok: true, message: `그룹멘토링을 등록했습니다. 멘티 ${r.count}명에게 각각 1회차로 기록됩니다. 진행 후 멘티별로 보고서를 올리세요.` };
}

/** 멘토: 그룹멘토링 일정 수정 (보고서 등록 전) */
export async function updateGroupSessionAction(input: { sessionId: string; mode: ConsultingMode; startedAt: string; endedAt: string; place?: string; caseIds?: string[] }): Promise<Result> {
  const m = await mentorCtx();
  if ('error' in m) return { ok: false, error: m.error };
  const r = await updateGroupSession({ ...input, mentorId: m.id, programId: m.programId });
  if (!r.ok) return r;
  revalidate(input.caseIds ?? []);
  return { ok: true, message: '그룹멘토링 일정을 수정했습니다.' };
}

/** 멘토: 그룹멘토링 삭제 (보고서 등록 전 — 참여 멘티 회차도 함께) */
export async function deleteGroupSessionAction(input: { sessionId: string; caseIds?: string[] }): Promise<Result> {
  const m = await mentorCtx();
  if ('error' in m) return { ok: false, error: m.error };
  const r = await deleteGroupSession({ sessionId: input.sessionId, mentorId: m.id, programId: m.programId });
  if (!r.ok) return r;
  revalidate(input.caseIds ?? []);
  return { ok: true, message: '그룹멘토링을 삭제했습니다.' };
}
