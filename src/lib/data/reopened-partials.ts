import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { menteeLabel } from '@/lib/utils/labels';

/** [검수로 되돌리기]·확정 취소로 남은 사유 접두 — cancelSettlement 의 cancel_reason 앞부분 */
export const REOPEN_REASON_PREFIX = '검수로 되돌리기:';

export interface ReopenedPartialRow {
  caseId: string;
  menteeName: string;
  groupName: string | null;
  caseStatus: string;
  mentorId: string;
  mentorName: string;
  reason: string;
  canceledAt: string;
  /** 그 멘토가 보고서까지 등록했고 아직 정산되지 않은 회차 수 — 다시 확정할 대상 */
  unsettledRounds: number;
  corrected: number;
}

/**
 * (2026-11-16) 검수로 되돌린 부분 정산(멘토·멘티 중도 종료) — 케이스가 검수 단계로 가지 않으므로(재배정 대기·중도 종료 유지)
 * 회차를 정정한 뒤 [부분 정산 다시 확정]할 때까지 검수 화면 [되돌린 부분 정산] 탭에 모아 둔다.
 * 대상 = cancel_reason 이 '검수로 되돌리기:' 로 시작하는 취소된 partial 중, 같은 케이스×멘토에 살아 있는 정산이 없고
 * 그 멘토의 미정산 이행 회차가 남은 것. 활성 멘토(다시 배정됨)는 종결 검수로 정산하므로 제외.
 */
export async function listReopenedPartials(programId: string, supportTypeId: string | null): Promise<ReopenedPartialRow[]> {
  const admin = createAdminClient();
  const canceled = await fetchAll<{ id: string; case_id: string; mentor_id: string; cancel_reason: string | null; canceled_at: string | null }>((from, to) =>
    admin.from('settlements').select('id, case_id, mentor_id, cancel_reason, canceled_at').eq('program_id', programId).eq('kind', 'partial').eq('status', 'canceled').like('cancel_reason', `${REOPEN_REASON_PREFIX}%`).order('canceled_at', { ascending: false }).range(from, to),
  );
  if (canceled.length === 0) return [];
  const caseIds = Array.from(new Set(canceled.map((s) => s.case_id)));
  const [cases, live, assigns, logs] = await Promise.all([
    fetchAllIn<{ id: string; owner_name: string; business_name: string | null; status: string; support_type_id: string }>(caseIds, (chunk, from, to) => admin.from('cases').select('id, owner_name, business_name, status, support_type_id').in('id', chunk).range(from, to)),
    fetchAllIn<{ case_id: string; mentor_id: string }>(caseIds, (chunk, from, to) => admin.from('settlements').select('case_id, mentor_id').in('case_id', chunk).neq('status', 'canceled').range(from, to)),
    fetchAllIn<{ case_id: string; mentor_id: string }>(caseIds, (chunk, from, to) => admin.from('mentor_assignments').select('case_id, mentor_id').in('case_id', chunk).eq('is_active', true).range(from, to)),
    fetchAllIn<{ case_id: string; mentor_id: string; corrected_at: string | null }>(caseIds, (chunk, from, to) =>
      admin.from('mentoring_logs').select('case_id, mentor_id, corrected_at').in('case_id', chunk).not('report_registered_at', 'is', null).is('settlement_id', null).range(from, to),
    ),
  ]);
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const key = (c: string, m: string) => `${c}|${m}`;
  const liveSet = new Set(live.map((s) => key(s.case_id, s.mentor_id)));
  const activeSet = new Set(assigns.map((a) => key(a.case_id, a.mentor_id)));
  const groupIds = Array.from(new Set(cases.map((c) => c.support_type_id)));
  const mentorIds = Array.from(new Set(canceled.map((s) => s.mentor_id)));
  const [{ data: groups }, mentors] = await Promise.all([
    admin.from('support_types').select('id, name').in('id', groupIds),
    fetchAllIn<{ id: string; name: string }>(mentorIds, (chunk, from, to) => admin.from('users').select('id, name').in('id', chunk).range(from, to)),
  ]);
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const mentorName = new Map(mentors.map((m) => [m.id, m.name]));
  const seen = new Set<string>();
  const out: ReopenedPartialRow[] = [];
  for (const s of canceled) {
    const k = key(s.case_id, s.mentor_id);
    if (seen.has(k) || liveSet.has(k) || activeSet.has(k)) continue;
    seen.add(k);
    const c = caseById.get(s.case_id);
    if (!c || c.status === 'closed') continue;
    if (supportTypeId && c.support_type_id !== supportTypeId) continue;
    const mine = logs.filter((l) => l.case_id === s.case_id && l.mentor_id === s.mentor_id);
    if (mine.length === 0) continue;
    out.push({
      caseId: c.id,
      menteeName: menteeLabel(c.owner_name, c.business_name),
      groupName: groupName.get(c.support_type_id) ?? null,
      caseStatus: c.status,
      mentorId: s.mentor_id,
      mentorName: mentorName.get(s.mentor_id) ?? '멘토',
      reason: (s.cancel_reason ?? '').slice(REOPEN_REASON_PREFIX.length).trim(),
      canceledAt: s.canceled_at ?? '',
      unsettledRounds: mine.length,
      corrected: mine.filter((l) => l.corrected_at && s.canceled_at && l.corrected_at > s.canceled_at).length,
    });
  }
  return out;
}
