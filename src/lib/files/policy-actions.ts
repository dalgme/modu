'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/workflow/audit';
import { parseFilePolicy } from '@/lib/files/business-plan-shared';
import type { Json } from '@/types/database';

type Result = { ok: true } | { ok: false; error: string };

/**
 * 멘티 사업계획서 다운로드 허용 토글 (2026-09-30) — 운영 설정 [파일 보안], `settings` 권한, 실명 기준.
 * programs.file_policy 의 다른 키는 그대로 두고 business_plan_download 만 바꾼다.
 */
export async function updateBusinessPlanDownloadAction(allow: boolean): Promise<Result> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'settings');
  if (denied) return { ok: false, error: denied };
  if (typeof allow !== 'boolean') return { ok: false, error: '값이 올바르지 않습니다.' };

  const admin = createAdminClient();
  const { data: p, error: readErr } = await admin.from('programs').select('file_policy').eq('id', ctx.programId).maybeSingle();
  if (readErr || !p) return { ok: false, error: '행사 정보를 읽지 못했습니다.' };
  const raw = p.file_policy && typeof p.file_policy === 'object' && !Array.isArray(p.file_policy) ? (p.file_policy as Record<string, Json>) : {};
  const before = parseFilePolicy(raw).businessPlanDownload;
  if (before === allow) return { ok: true };
  const { error } = await admin.from('programs').update({ file_policy: { ...raw, business_plan_download: allow } }).eq('id', ctx.programId);
  if (error) return { ok: false, error: `저장 실패: ${error.message}` };
  await logAudit(admin, {
    actorId: profile.id,
    programId: ctx.programId,
    action: 'settings.file_policy',
    entityType: 'settings',
    metadata: { key: 'business_plan_download', before, after: allow },
  });
  revalidatePath('/nextlab/settings');
  revalidatePath('/nextlab/files');
  revalidatePath('/mentor', 'layout');
  return { ok: true };
}
