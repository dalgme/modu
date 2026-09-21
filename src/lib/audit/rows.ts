import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { AuditRow } from '@/components/audit/audit-table';

function onBehalfOf(m: unknown): string | null {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const v = (m as Record<string, unknown>).on_behalf_of;
  return typeof v === 'string' ? v : null;
}

/**
 * 행사 범위 감사로그 표 데이터 (최근 limit 건) — 행사 감사로그 페이지·운영 설정 [감사 로그] 탭 공용.
 * 호출부에서 requireStaff/requireNextlab + requireContext 로 권한·범위를 강제한다.
 */
export async function loadProgramAuditRows(programId: string, limit = 200): Promise<AuditRow[]> {
  const admin = createAdminClient();
  const { data: logs } = await admin
    .from('audit_logs')
    .select('id, actor_id, action, entity_type, entity_id, created_at, metadata, program_id')
    .eq('program_id', programId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const ids = new Set<string>();
  for (const l of logs ?? []) {
    if (l.actor_id) ids.add(l.actor_id);
    const ob = onBehalfOf(l.metadata);
    if (ob) ids.add(ob);
  }
  const { data: users } = ids.size
    ? await admin.from('users').select('id, name').in('id', Array.from(ids))
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));

  return (logs ?? []).map((l) => ({
    id: l.id,
    created_at: l.created_at,
    action: l.action,
    entity_type: l.entity_type,
    entity_id: l.entity_id,
    metadata: l.metadata,
    actor_id: l.actor_id,
    program_id: l.program_id,
    actorName: l.actor_id ? (nameById.get(l.actor_id) ?? '알 수 없음') : null,
    onBehalfOfName: (() => {
      const ob = onBehalfOf(l.metadata);
      return ob ? (nameById.get(ob) ?? '멘토') : null;
    })(),
  }));
}
