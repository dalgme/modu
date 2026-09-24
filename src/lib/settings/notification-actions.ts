'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit, type DB } from '@/lib/workflow/audit';
import { NOTIFICATION_EVENT_DEFS } from '@/lib/notifications/templates';
import type { Json } from '@/types/database';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const OPERATOR_ONLY = '운영사 담당자만 실행할 수 있습니다.';

/**
 * (P32) 알림 이벤트별 on/off 저장 — programs.notification_settings.
 * 입력 map 은 { event: true|false }. 저장은 `false` 인 키만 남기고(true = 키 삭제) 알 수 없는 키·잠긴(lockable) 이벤트의 false 는 거부한다.
 * 가드는 src/lib/settings/actions.ts 의 operator() 와 같다: 실제 신원(대행 불가) 운영사 + 행사 컨텍스트 + 'settings' 권한.
 */
export async function updateNotificationSettingsAction(map: Record<string, boolean>): Promise<Result> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'settings');
  if (denied) return { ok: false, error: denied };

  if (!map || typeof map !== 'object' || Array.isArray(map)) return { ok: false, error: '입력값을 확인하세요.' };
  const defs = new Map(NOTIFICATION_EVENT_DEFS.map((d) => [d.key, d]));
  const next: Record<string, false> = {};
  for (const [key, value] of Object.entries(map)) {
    const def = defs.get(key);
    if (!def) return { ok: false, error: `알 수 없는 알림 이벤트입니다: ${key}` };
    if (typeof value !== 'boolean') return { ok: false, error: `값이 올바르지 않습니다: ${key}` };
    if (value) continue; // true = 기본(발송) → 키 저장 안 함
    if (def.lockable) return { ok: false, error: `'${def.label}' 알림은 끌 수 없습니다 (정산·품의 게이트).` };
    next[key] = false;
  }

  const admin = createAdminClient();
  const { data: before } = await admin.from('programs').select('notification_settings').eq('id', ctx.programId).maybeSingle();
  const { error } = await admin.from('programs').update({ notification_settings: next as Json }).eq('id', ctx.programId);
  if (error) return { ok: false, error: error.message };

  await logAudit(admin as unknown as DB, {
    actorId: profile.id,
    programId: ctx.programId,
    action: 'notification.settings',
    entityType: 'settings',
    entityId: ctx.programId,
    metadata: { key: 'notification_settings', before: (before?.notification_settings ?? {}) as Json, after: next as Json, off_count: Object.keys(next).length },
  });
  revalidatePath('/nextlab/settings');
  const offCount = Object.keys(next).length;
  return { ok: true, message: offCount === 0 ? '모든 알림을 발송합니다.' : `${offCount}개 이벤트의 문자·알림톡을 끕니다.` };
}
