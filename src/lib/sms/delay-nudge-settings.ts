import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/** 지연 독려 문자 문구 저장 위치 — app_settings(key, program_id) 행사 범위 (2026-11-09). 없으면 기본 문구. */
export const DELAY_NUDGE_TEMPLATE_KEY = 'delay_nudge_template';

export async function getDelayNudgeTemplate(programId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from('app_settings').select('value').eq('key', DELAY_NUDGE_TEMPLATE_KEY).eq('program_id', programId).maybeSingle();
  if (error) console.error('getDelayNudgeTemplate failed:', error.message);
  return data?.value?.trim() ? data.value : null;
}

/** 저장(null = 기본 문구로 되돌림 → 행 삭제). 표현식 유니크라 select → update/insert */
export async function setDelayNudgeTemplate(programId: string, value: string | null, actorId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: row } = await admin.from('app_settings').select('id').eq('key', DELAY_NUDGE_TEMPLATE_KEY).eq('program_id', programId).maybeSingle();
  if (value === null) {
    if (!row) return null;
    const { error } = await admin.from('app_settings').delete().eq('id', row.id);
    return error?.message ?? null;
  }
  const payload = { value, updated_by: actorId, updated_at: new Date().toISOString() };
  const { error } = row
    ? await admin.from('app_settings').update(payload).eq('id', row.id)
    : await admin.from('app_settings').insert({ key: DELAY_NUDGE_TEMPLATE_KEY, program_id: programId, ...payload });
  return error?.message ?? null;
}
