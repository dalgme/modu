'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/workflow/audit';
import { getDelayNudgeTemplate, setDelayNudgeTemplate } from '@/lib/sms/delay-nudge-settings';
import { DEFAULT_DELAY_NUDGE_TEMPLATE, validateDelayNudgeTemplate } from '@/lib/sms/delay-nudge-template';

type Result = { ok: true; message: string } | { ok: false; error: string };

/**
 * 지연 독려 문자 문구 저장 (2026-11-09) — 문자 발송 › 자동발송 탭. 운영사 실제 신원 + 'sms' 권한, 컨텍스트 행사.
 * template = null 이면 기본 문구로 되돌린다. 감사 `sms.delay_nudge_template`(이전·이후 문구).
 */
export async function saveDelayNudgeTemplateAction(template: string | null): Promise<Result> {
  const actor = await realRoleOrNull(['nextlab']);
  if (!actor) return { ok: false, error: '운영사 담당자만 수정할 수 있습니다.' };
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'sms');
  if (denied) return { ok: false, error: denied };

  let next: string | null = null;
  if (template !== null) {
    const bad = validateDelayNudgeTemplate(template);
    if (bad) return { ok: false, error: bad };
    next = template.trim() === DEFAULT_DELAY_NUDGE_TEMPLATE.trim() ? null : template.trim();
  }
  const before = await getDelayNudgeTemplate(ctx.programId);
  const err = await setDelayNudgeTemplate(ctx.programId, next, actor.id);
  if (err) return { ok: false, error: `저장하지 못했습니다: ${err}` };
  await logAudit(createAdminClient(), { actorId: actor.id, programId: ctx.programId, action: 'sms.delay_nudge_template', entityType: 'settings', metadata: { before: before ?? '(기본 문구)', after: next ?? '(기본 문구)' } });
  revalidatePath('/admin/settings/sms');
  revalidatePath('/nextlab/reports');
  revalidatePath('/nextlab/dashboard');
  return { ok: true, message: next ? '지연 독려 문구를 저장했습니다. 다음 발송부터 이 문구로 나갑니다.' : '기본 문구로 되돌렸습니다.' };
}
