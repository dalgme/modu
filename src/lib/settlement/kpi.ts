import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll } from '@/lib/supabase/paginate';

/**
 * (P31) 운영사 정산 화면 KPI — 한 함수에서 계산.
 *  - 지급 예정 합계: 제출·정산 확인된(아직 미지급) 품의의 실지급 합
 *  - 발주처 확인 대기 품의: 제출 후 경과일(가장 오래된 것)
 *  - 멘토별 미지급 누계: 확정됐지만 아직 지급되지 않은(pending·batched·confirmed) 정산의 실지급 합, 상위 N
 */
export interface SettlementKpi {
  scheduledNet: number;
  scheduledBatches: number;
  waitingBatches: { id: string; title: string; days: number; net: number }[];
  unpaidByMentor: { mentorId: string; mentorName: string; count: number; net: number }[];
  unpaidTotalNet: number;
}

const daysSince = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : 0);

export async function computeSettlementKpi(programId: string, supportTypeId?: string | null, top = 5): Promise<SettlementKpi> {
  const admin = createAdminClient();
  const [{ data: batches }, rows] = await Promise.all([
    admin.from('settlement_batches').select('id, title, status, submitted_at, total_net').eq('program_id', programId).in('status', ['submitted', 'confirmed']),
    fetchAll<{ id: string; case_id: string; mentor_id: string; net: number; status: string; batch_id: string | null }>((from, to) =>
      admin.from('settlements').select('id, case_id, mentor_id, net, status, batch_id').eq('program_id', programId).in('status', ['pending', 'batched', 'confirmed']).range(from, to),
    ),
  ]);
  let unpaid = rows;
  if (supportTypeId) {
    const caseIds = Array.from(new Set(rows.map((r) => r.case_id)));
    const { data: cases } = caseIds.length ? await admin.from('cases').select('id').eq('support_type_id', supportTypeId).in('id', caseIds.slice(0, 1000)) : { data: [] as { id: string }[] };
    const ok = new Set((cases ?? []).map((c) => c.id));
    unpaid = rows.filter((r) => ok.has(r.case_id));
  }
  const byMentor = new Map<string, { count: number; net: number }>();
  for (const r of unpaid) {
    const m = byMentor.get(r.mentor_id) ?? { count: 0, net: 0 };
    m.count += 1;
    m.net += Number(r.net);
    byMentor.set(r.mentor_id, m);
  }
  const mentorIds = Array.from(byMentor.keys());
  const { data: users } = mentorIds.length ? await admin.from('users').select('id, name').in('id', mentorIds) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((users ?? []).map((u) => [u.id, u.name]));
  const unpaidByMentor = Array.from(byMentor.entries())
    .map(([mentorId, v]) => ({ mentorId, mentorName: nameOf.get(mentorId) ?? '-', ...v }))
    .sort((a, b) => b.net - a.net)
    .slice(0, top);
  // 그룹 범위면 그 그룹 정산이 든 품의만
  const scopedBatchIds = supportTypeId ? new Set(unpaid.map((r) => r.batch_id).filter((x): x is string => !!x)) : null;
  const list = (batches ?? []).filter((b) => !scopedBatchIds || scopedBatchIds.has(b.id));
  const scheduled = list.filter((b) => b.status === 'submitted' || b.status === 'confirmed');
  return {
    scheduledNet: scheduled.reduce((s, b) => s + Number(b.total_net), 0),
    scheduledBatches: scheduled.length,
    waitingBatches: list.filter((b) => b.status === 'submitted').map((b) => ({ id: b.id, title: b.title, days: daysSince(b.submitted_at), net: Number(b.total_net) })).sort((a, b) => b.days - a.days),
    unpaidByMentor,
    unpaidTotalNet: unpaid.reduce((s, r) => s + Number(r.net), 0),
  };
}
