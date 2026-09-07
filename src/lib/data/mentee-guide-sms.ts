import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/** 멘티 안내 문자 발송 기록용 audit_logs action (스키마 변경 없이 발송 여부 추적) */
export const MENTEE_GUIDE_SMS_ACTION = 'sms.mentee_guide';

/**
 * 케이스별 '멘티 안내 문자' 최초 발송 일시(ISO) 맵.
 * audit_logs(action='sms.mentee_guide') 기반이라 별도 스키마 변경이 필요 없다.
 */
export async function getMenteeGuideSmsSentMap(caseIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (caseIds.length === 0) return map;
  const admin = createAdminClient();
  const { data } = await admin
    .from('audit_logs')
    .select('entity_id, created_at')
    .eq('action', MENTEE_GUIDE_SMS_ACTION)
    .eq('entity_type', 'cases')
    .in('entity_id', caseIds)
    .order('created_at', { ascending: true });
  for (const r of data ?? []) {
    if (r.entity_id && !map.has(r.entity_id)) map.set(r.entity_id, r.created_at);
  }
  return map;
}
