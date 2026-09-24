'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { reinstateCase } from '@/lib/workflow/withdrawal';
import type { WorkflowResult } from '@/lib/workflow/cases';

/** 운영사 PL: T13 중도 종료 복귀 (P30) — 'case.manage' + 메인 담당자(등급 없음 = PL 취급). */
export async function reinstateCaseAction(caseId: string, reason: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.manage');
  if (denied) return { ok: false, error: denied };
  if (ctx.grade && ctx.grade !== 'pl') return { ok: false, error: '중도 종료 복귀는 메인 담당자(PL)만 할 수 있습니다.' };
  const { data: c } = await createAdminClient().from('cases').select('program_id').eq('id', caseId).maybeSingle();
  if (!c || c.program_id !== ctx.programId) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  const r = await reinstateCase(caseId, profile.id, reason ?? '');
  if (r.ok) {
    revalidatePath('/nextlab/dashboard');
    revalidatePath(`/nextlab/cases/${caseId}`);
    revalidatePath('/institution/dashboard');
    revalidatePath(`/institution/cases/${caseId}`);
    revalidatePath('/nextlab/reports');
    revalidatePath('/nextlab/roster');
  }
  return r;
}
