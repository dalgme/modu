import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export interface EditGrant {
  id: string;
  caseId: string;
  target: 'nextlab' | 'mentor';
  grantedAt: string;
  expiresAt: string;
}

/** 활성 임시 수정권한(미마감 + 미만료) 1건. 없으면 null. */
export async function getActiveEditGrant(caseId: string): Promise<EditGrant | null> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from('case_edit_grants')
    .select('id, case_id, target, granted_at, expires_at')
    .eq('case_id', caseId)
    .is('closed_at', null)
    .gt('expires_at', nowIso)
    .order('granted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    caseId: data.case_id,
    target: data.target === 'nextlab' ? 'nextlab' : 'mentor',
    grantedAt: data.granted_at,
    expiresAt: data.expires_at,
  };
}

/** 활성 임시 수정권한 존재 여부 (편집 게이트용) */
export async function hasActiveEditGrant(caseId: string): Promise<boolean> {
  return (await getActiveEditGrant(caseId)) !== null;
}

/** 여러 케이스 중 활성 임시 수정권한이 있는 케이스ID 집합 (대시보드·현황판 배지용) */
export async function getActiveEditGrantCaseIds(caseIds: string[]): Promise<Set<string>> {
  if (caseIds.length === 0) return new Set();
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from('case_edit_grants')
    .select('case_id')
    .in('case_id', caseIds)
    .is('closed_at', null)
    .gt('expires_at', nowIso);
  return new Set((data ?? []).map((r) => r.case_id).filter(Boolean) as string[]);
}
