'use server';

import { revalidatePath } from 'next/cache';

import { requireNextlab } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit, type DB } from '@/lib/workflow/audit';
import { MENTORING_OUTCOME_LABELS, normalizeMentoringOutcome } from '@/lib/workflow/mentoring-outcome';

export type MentoringOutcomeResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * 멘토링 결과 구분 저장 (2026-11-03) — 운영사(case.manage) · 컨텍스트 행사의 케이스만.
 * outcome = 'gave_up' | 'ended' | null(구분 해제). 케이스 상태·배정·정산은 바꾸지 않는다.
 */
export async function setMentoringOutcomeAction(caseId: string, outcomeRaw: string | null): Promise<MentoringOutcomeResult> {
  const actor = await requireNextlab();
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.manage');
  if (denied) return { ok: false, error: denied };
  const outcome = outcomeRaw === null || outcomeRaw === '' ? null : normalizeMentoringOutcome(outcomeRaw);
  if (outcomeRaw && !outcome) return { ok: false, error: '알 수 없는 구분입니다.' };

  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, program_id, owner_name, mentoring_outcome').eq('id', caseId).maybeSingle();
  if (!c || c.program_id !== ctx.programId) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  const before = normalizeMentoringOutcome(c.mentoring_outcome);
  if (before === outcome) return { ok: true, message: '변경 사항이 없습니다.' };

  const { error } = await admin
    .from('cases')
    .update({ mentoring_outcome: outcome, mentoring_outcome_at: outcome ? new Date().toISOString() : null, mentoring_outcome_by: outcome ? actor.id : null })
    .eq('id', caseId);
  if (error) return { ok: false, error: `저장하지 못했습니다: ${error.message}` };

  await logAudit(admin as unknown as DB, {
    actorId: actor.id,
    programId: ctx.programId,
    action: 'case.mentoring_outcome',
    entityType: 'cases',
    entityId: caseId,
    metadata: { case_id: caseId, mentee: c.owner_name, before, after: outcome },
  });

  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/reports');
  revalidatePath(`/nextlab/cases/${caseId}`);
  return { ok: true, message: outcome ? `${c.owner_name} 멘티를 '${MENTORING_OUTCOME_LABELS[outcome]}'로 표시했습니다.` : `${c.owner_name} 멘티의 구분을 해제했습니다.` };
}
