'use server';

import { revalidatePath } from 'next/cache';

import { getRealSessionProfile } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { runBackup, type BackupResult } from '@/lib/ops/backup';

type Result = { ok: true; result: BackupResult } | { ok: false; error: string };

/**
 * [지금 백업] (P35-B) — 플랫폼 통합관리자(owner)만. 실제 신원 기준(대행 무관). 감사 `backup.manual`.
 * 서버 액션 실행 시간은 Vercel 함수 제한을 따른다 — 데이터가 커서 시간을 넘기면 Cron(maxDuration 300) 기록으로 확인한다.
 */
export async function runBackupNowAction(): Promise<Result> {
  const real = await getRealSessionProfile();
  if (!real || !real.is_active || !real.is_platform_admin) return { ok: false, error: '플랫폼 관리자만 실행할 수 있습니다.' };
  if (real.platform_role !== 'owner') return { ok: false, error: '플랫폼 통합관리자(owner)만 수동 백업을 실행할 수 있습니다.' };

  const result = await runBackup({ kind: 'manual', startedBy: real.id });
  const { error } = await createAdminClient().from('audit_logs').insert({
    actor_id: real.id,
    program_id: null,
    action: 'backup.manual',
    entity_type: 'backup_runs',
    entity_id: result.runId,
    metadata: { status: result.status, bytes: result.bytes, tables: Object.keys(result.tables).length, error: result.error, duration_ms: result.durationMs },
  });
  // 감사 insert 오류는 삼키지 않는다 (§6-3)
  if (error) console.error('[backup.manual] audit insert failed:', error.message);
  revalidatePath('/platform/security');
  if (result.status === 'failed') return { ok: false, error: `백업 실패: ${result.error ?? '알 수 없는 오류'}` };
  return { ok: true, result };
}
