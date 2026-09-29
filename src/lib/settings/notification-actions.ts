'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit, type DB } from '@/lib/workflow/audit';
import { diffAutoSendSettings, normalizeAutoSendSettings } from '@/lib/notifications/templates';
import type { Json } from '@/types/database';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const OPERATOR_ONLY = '운영사 담당자만 실행할 수 있습니다.';

/**
 * (P32·P36) 자동발송 on/off 저장 — programs.notification_settings. 문자 발송 › 자동발송 탭.
 * 입력 map 은 { key: true|false } (알림 이벤트 + 직발송 자동 문자 키). 저장은 `false` 인 키만 남기고(true = 키 삭제)
 * 알 수 없는 키·잠긴(lockable) 이벤트의 false 는 거부한다 (`normalizeAutoSendSettings`).
 * 가드는 src/lib/settings/actions.ts 의 operator() 와 같다: 실제 신원(대행 불가) 운영사 + 행사 컨텍스트 + 'settings' 권한.
 */
export async function updateNotificationSettingsAction(map: Record<string, boolean>): Promise<Result> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'settings');
  if (denied) return { ok: false, error: denied };

  const norm = normalizeAutoSendSettings(map);
  if (!norm.ok) return { ok: false, error: norm.error };
  const next = norm.next;

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
    metadata: {
      key: 'notification_settings',
      before: (before?.notification_settings ?? {}) as Json,
      after: next as Json,
      off_count: Object.keys(next).length,
      // 바뀐 항목만 (켬↔끔) — 자동발송 탭 (P36)
      changed: diffAutoSendSettings(before?.notification_settings ?? {}, next) as unknown as Json,
    },
  });
  revalidatePath('/admin/settings/sms');
  const offCount = Object.keys(next).length;
  return { ok: true, message: offCount === 0 ? '모든 자동발송을 켭니다.' : `${offCount}개 자동발송 항목을 끕니다.` };
}
