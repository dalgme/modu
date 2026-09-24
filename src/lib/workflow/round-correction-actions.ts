'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { correctRound } from '@/lib/workflow/rounds';
import type { ConsultingMode } from '@/lib/settlement/rates';
import type { WorkflowResult } from '@/lib/workflow/cases';

/**
 * 운영사 회차 정정 (P30) — 멘토가 잘못 등록한 일시·방법·장소를 운영사가 사후 정정한다.
 * 실제 신원(대행 불가) + 'case.manage' 권한 + 컨텍스트 행사 케이스만. 정산 포함 회차는 rounds.ts 가 거부한다.
 */
export async function correctRoundAction(
  caseId: string,
  logId: string,
  input: { mode: ConsultingMode; startedAt: string; endedAt: string; place?: string },
  reason: string,
): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.manage');
  if (denied) return { ok: false, error: denied };
  const { data: c } = await createAdminClient().from('cases').select('program_id').eq('id', caseId).maybeSingle();
  if (!c || c.program_id !== ctx.programId) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  const r = await correctRound({ caseId, logId, actorId: profile.id, mode: input.mode, startedAt: input.startedAt, endedAt: input.endedAt, place: input.place, reason });
  if (r.ok) {
    revalidatePath(`/nextlab/cases/${caseId}`);
    revalidatePath(`/mentor/cases/${caseId}`);
    revalidatePath(`/institution/cases/${caseId}`);
    revalidatePath('/nextlab/dashboard');
    revalidatePath('/nextlab/reports');
  }
  return r;
}
