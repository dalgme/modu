import { requireStaff } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { AuditTable, type AuditRow } from '@/components/audit/audit-table';

export const dynamic = 'force-dynamic';

/** 행사 감사로그 — 이 행사(program_id) 범위. 설명문 + [소스] 팝업 (플랫폼 통합 감사로그와 같은 표) */
export default async function Page() {
  const profile = await requireStaff();
  const ctx = await requireContext(profile);
  const admin = createAdminClient();
  const { data: logs } = await admin
    .from('audit_logs')
    .select('id, actor_id, action, entity_type, entity_id, created_at, metadata, program_id')
    .eq('program_id', ctx.programId)
    .order('created_at', { ascending: false })
    .limit(200);

  const onBehalfOf = (m: unknown): string | null => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    const v = (m as Record<string, unknown>).on_behalf_of;
    return typeof v === 'string' ? v : null;
  };
  const ids = new Set<string>();
  for (const l of logs ?? []) {
    if (l.actor_id) ids.add(l.actor_id);
    const ob = onBehalfOf(l.metadata);
    if (ob) ids.add(ob);
  }
  const { data: users } = ids.size ? await admin.from('users').select('id, name').in('id', Array.from(ids)) : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  const rows: AuditRow[] = (logs ?? []).map((l) => ({
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

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">감사 로그</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name} 의 관리자 액션 이력 (INSERT-only · 위변조 방지). 최근 200건. [소스] 를 누르면 원본 로그를 봅니다.
        </p>
      </div>
      <AuditTable rows={rows} />
    </main>
  );
}
