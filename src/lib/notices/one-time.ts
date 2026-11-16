import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/** (2026-11-16) 한 번만 보여 주는 안내 팝업 — 읽음 기록 user_notice_reads (서비스롤 전용) */
export const MENTOR_PDF_ONLY_NOTICE_KEY = 'mentor_pdf_only_upload';

/** 아직 읽지 않았으면 true. 조회 오류면 false(팝업이 매번 뜨는 것보다 한 번 놓치는 편이 낫다) */
export async function noticeUnread(userId: string, key: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from('user_notice_reads').select('user_id').eq('user_id', userId).eq('notice_key', key).maybeSingle();
  if (error) {
    console.error('[notice] read check failed', key, error.message);
    return false;
  }
  return !data;
}

export async function markNoticeRead(userId: string, key: string, programId: string | null): Promise<{ ok: boolean }> {
  const { error } = await createAdminClient().from('user_notice_reads').upsert({ user_id: userId, notice_key: key, program_id: programId }, { onConflict: 'user_id,notice_key', ignoreDuplicates: true });
  if (error) console.error('[notice] mark read failed', key, error.message);
  return { ok: !error };
}
