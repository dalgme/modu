'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { succeedCases, type SuccessionKind, type SuccessionResult } from '@/lib/workflow/succession';

/**
 * 운영사: 그룹 간 승계 개설 / 재배치 등록 (P30). case-actions.ts 의 succeedCasesAction 을 대체한다(옵션 확장).
 * 실제 신원(대행 불가) + 'case.manage'.
 */
export async function succeedCasesV2Action(input: {
  sourceCaseIds: string[];
  targetGroupId: string;
  keepMentor: boolean;
  copyRequiredDocs?: boolean;
  kind?: SuccessionKind;
}): Promise<{ ok: true; result: SuccessionResult } | { ok: false; error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.manage');
  if (denied) return { ok: false, error: denied };
  const r = await succeedCases({
    programId: ctx.programId,
    actorId: profile.id,
    sourceCaseIds: Array.isArray(input.sourceCaseIds) ? input.sourceCaseIds : [],
    targetGroupId: input.targetGroupId,
    keepMentor: !!input.keepMentor,
    copyRequiredDocs: input.copyRequiredDocs ?? true,
    kind: input.kind === 'relocation' ? 'relocation' : 'succession',
  });
  if (r.ok) {
    revalidatePath('/nextlab/dashboard');
    revalidatePath('/nextlab/settings');
    revalidatePath('/nextlab/roster');
    revalidatePath('/nextlab/reports');
  }
  return r;
}
