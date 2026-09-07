import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export interface SupplementRequestItem {
  id: string;
  caseId: string;
  phase: 'pre' | 'post' | 'general';
  message: string;
  createdByRole: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

function mapRow(r: {
  id: string;
  case_id: string;
  phase: string;
  message: string;
  created_by_role: string | null;
  resolved_at: string | null;
  created_at: string;
}): SupplementRequestItem {
  return {
    id: r.id,
    caseId: r.case_id,
    phase: (r.phase as 'pre' | 'post' | 'general') ?? 'general',
    message: r.message,
    createdByRole: r.created_by_role,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
  };
}

/** 케이스 보완 요청 전체(최근순) — 운영/멘토 케이스 상세용 */
export async function listSupplementRequests(caseId: string): Promise<SupplementRequestItem[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('supplement_requests')
    .select('id, case_id, phase, message, created_by_role, resolved_at, created_at')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });
  return (data ?? []).map(mapRow);
}

/** 미처리 보완 요청만 — 멘티 대시보드 알림용 */
export async function listOpenSupplementRequests(caseId: string): Promise<SupplementRequestItem[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('supplement_requests')
    .select('id, case_id, phase, message, created_by_role, resolved_at, created_at')
    .eq('case_id', caseId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false });
  return (data ?? []).map(mapRow);
}
