import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { batchConfirmerFor, type BatchConfirmer } from '@/lib/settlement/batch-confirmer-rule';

/** 행사 안 라운드별 발주처 [정산 품의] 기능 켜짐 여부 (컬럼이 없으면 = 꺼짐) */
export async function institutionSettlementFlags(programId: string): Promise<Map<string, boolean>> {
  const { data, error } = await createAdminClient().from('support_types').select('*').eq('program_id', programId);
  if (error) console.error('[batch-confirmer] support_types load failed:', error.message);
  return new Map((data ?? []).map((g) => [g.id as string, (g as { institution_settlement_enabled?: boolean | null }).institution_settlement_enabled === true]));
}

/** 품의별 정산 확인 주체 — 품의에 든(취소 제외) 정산의 케이스 라운드 설정으로 판정 */
export async function loadBatchConfirmers(programId: string, batchIds: string[]): Promise<Map<string, BatchConfirmer>> {
  const out = new Map<string, BatchConfirmer>();
  if (batchIds.length === 0) return out;
  const admin = createAdminClient();
  const [flags, items] = await Promise.all([
    institutionSettlementFlags(programId),
    fetchAllIn<{ batch_id: string | null; case_id: string }>(batchIds, (chunk, from, to) => admin.from('settlements').select('batch_id, case_id').in('batch_id', chunk).neq('status', 'canceled').range(from, to)),
  ]);
  const caseIds = Array.from(new Set(items.map((i) => i.case_id)));
  const cases = await fetchAllIn<{ id: string; support_type_id: string }>(caseIds, (chunk, from, to) => admin.from('cases').select('id, support_type_id').in('id', chunk).range(from, to));
  const groupOf = new Map(cases.map((c) => [c.id, c.support_type_id]));
  const flagsByBatch = new Map<string, boolean[]>();
  for (const i of items) {
    if (!i.batch_id) continue;
    (flagsByBatch.get(i.batch_id) ?? flagsByBatch.set(i.batch_id, []).get(i.batch_id)!).push(flags.get(groupOf.get(i.case_id) ?? '') === true);
  }
  for (const id of batchIds) out.set(id, batchConfirmerFor(flagsByBatch.get(id) ?? []));
  return out;
}

export async function loadBatchConfirmer(programId: string, batchId: string): Promise<BatchConfirmer> {
  return (await loadBatchConfirmers(programId, [batchId])).get(batchId) ?? 'operator';
}
