import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 주어진 케이스들 중 '지원신청서 수동 접수'(오프라인) 처리된 케이스ID 집합.
 * case_status_history 의 수동 접수 이력 노트로 판정한다.
 */
export async function getManuallyReceivedCaseIds(caseIds: string[]): Promise<Set<string>> {
  if (caseIds.length === 0) return new Set();
  const admin = createAdminClient();
  const { data } = await admin
    .from('case_status_history')
    .select('case_id')
    .in('case_id', caseIds)
    .like('note', '지원신청서 수동 접수%');
  return new Set((data ?? []).map((r) => r.case_id).filter(Boolean) as string[]);
}
