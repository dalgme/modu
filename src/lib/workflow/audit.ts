import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/supabase/admin';
import { getImpersonation } from '@/lib/auth/impersonation';
import type { Database, Json } from '@/types/database';

export type DB = SupabaseClient<Database>;

interface AuditInput {
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Json;
}

/**
 * 관리자 액션 감사로그 기록 (INSERT-only).
 *
 * 대행(view-as) 중에는 actorId 로 '명의(대행 대상 멘토)'가 들어오는데, audit_logs RLS(0030)는
 * `with check (actor_id = auth.uid())` 라 anon 클라이언트 경로에서 조용히 폐기된다.
 * 그래서 대행 중이고 actorId 가 대행 대상 본인이면
 *   - actor_id 를 **실제 실행자(넥스트랩)** 로 바꾸고
 *   - metadata.on_behalf_of 에 명의를 남기며
 *   - service_role(admin) 로 기록해 RLS 를 우회한다.
 * 대행이 아니면 전달받은 클라이언트/actorId 를 그대로 쓴다(동작 불변).
 */
export async function logAudit(supabase: DB, input: AuditInput): Promise<void> {
  const imp = await getImpersonation();
  const onBehalf = imp && input.actorId && imp.target.id === input.actorId ? imp : null;

  const client = onBehalf ? (createAdminClient() as unknown as DB) : supabase;
  const actorId = onBehalf ? onBehalf.actorId : input.actorId;
  const base = input.metadata ?? null;
  const metadata = (
    onBehalf
      ? {
          ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}),
          on_behalf_of: input.actorId,
          via: 'view-as',
        }
      : base
  ) as Json;

  const { error } = await client.from('audit_logs').insert({
    actor_id: actorId,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata,
  });
  // RLS 위반 등으로 감사기록이 사라지는 사고를 조용히 넘기지 않는다(호출부 흐름은 깨지 않음).
  if (error) {
    console.error('[audit] insert failed', {
      action: input.action,
      actorId,
      message: error.message,
    });
  }
}
