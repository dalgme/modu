import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/** 감사로그 action — 멘토별 독려 문자 1행 (P30). entity = users(멘토). */
export const DELAY_NUDGE_ACTION = 'sms.delay_nudge';

/** 최근 독려 이력 — mentorId → 마지막 발송 시각(ISO). 목록·팝업이 "최근 독려 M/D" 를 보여주고 7일 내 재발송을 경고하는 데 쓴다. */
export type LastNudgeMap = Record<string, string>;

export async function listLastNudges(programId: string, mentorIds: string[]): Promise<LastNudgeMap> {
  const ids = Array.from(new Set(mentorIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const admin = createAdminClient();
  const out: LastNudgeMap = {};
  // 멘토 80명 규모 — 한 번에 조회 (감사행은 발송 1건당 1행이라 수백 행 이내)
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data } = await admin
      .from('audit_logs')
      .select('entity_id, created_at, metadata')
      .eq('program_id', programId)
      .eq('action', DELAY_NUDGE_ACTION)
      .eq('entity_type', 'users')
      .in('entity_id', chunk)
      .order('created_at', { ascending: false })
      .limit(2000);
    for (const row of data ?? []) {
      if (!row.entity_id || out[row.entity_id]) continue;
      // 실제 발송 성공한 건만 "최근 독려"로 친다 (실패·제외는 이력에 남되 표시 기준 아님)
      const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as { sent?: boolean };
      if (meta.sent === false) continue;
      out[row.entity_id] = row.created_at;
    }
  }
  return out;
}
