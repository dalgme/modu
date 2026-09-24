import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

export interface CaseAuditRow {
  id: string;
  actor_id: string | null;
  program_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Json | null;
  created_at: string;
}

/**
 * 케이스 [조치 이력]용 감사로그 (P31) — entity_type='cases' 인 행뿐 아니라
 * 회차·서류·메시지처럼 다른 엔티티에 남았지만 metadata.case_id 가 이 케이스인 행도 합친다(대행 기록 포함).
 * 두 조회를 id 로 합쳐 중복을 없애고 최신순으로 limit 건.
 */
export async function listCaseAuditRows(caseId: string, programId: string, limit = 50): Promise<CaseAuditRow[]> {
  const admin = createAdminClient();
  const cols = 'id, actor_id, program_id, action, entity_type, entity_id, metadata, created_at';
  const [{ data: byEntity }, { data: byMeta }] = await Promise.all([
    admin.from('audit_logs').select(cols).eq('entity_type', 'cases').eq('entity_id', caseId).order('created_at', { ascending: false }).limit(limit),
    admin.from('audit_logs').select(cols).eq('metadata->>case_id', caseId).order('created_at', { ascending: false }).limit(limit),
  ]);
  const seen = new Set<string>();
  const out: CaseAuditRow[] = [];
  for (const r of [...(byEntity ?? []), ...(byMeta ?? [])] as CaseAuditRow[]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  // 행사 범위 — 행사 밖에서 남은 기록(program_id null, 플랫폼 콘솔 등)은 유지하고 다른 행사 기록은 뺀다
  const scoped = out.filter((r) => r.program_id === null || r.program_id === programId);
  return scoped.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
}
