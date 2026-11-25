import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { menteeLabel } from '@/lib/utils/labels';
import { mentorHistoryStatus, type MentorHistoryItem } from '@/lib/data/mentor-history-shared';

/**
 * 멘토의 끝난 멘토링 내역 (2026-11-25) — 멘토 대시보드 "정산·종료된 멘토링".
 * 계기: 정산이 끝난 멘토링이 대시보드에서 사라짐 — 종결 확정·중도 종료로 끝까지 담당한 케이스만 보였고,
 * 멘토 변경·자진 종료·운영사 종료로 부분 정산된 멘토의 케이스는 어디에도 없었다.
 * 대상 = 이 멘토의 배정이 끝난 케이스(지금 다시 담당 중인 케이스 제외) 중 이 멘토가 진행한 회차나 정산이 있는 것.
 * 케이스 화면 열람은 끝까지 담당한 멘토만(RLS was_final_mentor_of) — 그 외에는 이 목록에서 내 회차·정산만 보여 준다.
 */
export async function listMentorHistory(mentorId: string, programId: string, supportTypeId?: string | null): Promise<MentorHistoryItem[]> {
  const admin = createAdminClient();
  const { data: assigns } = await admin
    .from('mentor_assignments')
    .select('case_id, is_active, end_kind, ended_at, assigned_at, cases!inner(program_id, support_type_id)')
    .eq('mentor_id', mentorId)
    .eq('cases.program_id', programId);
  const rows = (assigns ?? []).filter((a) => !supportTypeId || (a.cases as unknown as { support_type_id?: string } | null)?.support_type_id === supportTypeId);
  const activeCases = new Set(rows.filter((a) => a.is_active).map((a) => a.case_id));
  // 케이스별 마지막(최근) 종료 배정
  const lastEnded = new Map<string, { end_kind: string | null; ended_at: string | null }>();
  for (const a of rows) {
    if (a.is_active || activeCases.has(a.case_id)) continue;
    const prev = lastEnded.get(a.case_id);
    if (!prev || (a.ended_at ?? '') > (prev.ended_at ?? '')) lastEnded.set(a.case_id, { end_kind: a.end_kind, ended_at: a.ended_at });
  }
  const ids = Array.from(lastEnded.keys());
  if (ids.length === 0) return [];
  const [cases, logs, sets, groups] = await Promise.all([
    fetchAllIn<{ id: string; owner_name: string; business_name: string; status: string; support_type_id: string; closed_at: string | null }>(ids, (chunk, from, to) =>
      admin.from('cases').select('id, owner_name, business_name, status, support_type_id, closed_at').in('id', chunk).range(from, to),
    ),
    fetchAllIn<{ case_id: string; round_no: number; started_at: string; ended_at: string; mode: string; report_registered_at: string | null; amount_snapshot: number; settlement_id: string | null }>(ids, (chunk, from, to) =>
      admin.from('mentoring_logs').select('case_id, round_no, started_at, ended_at, mode, report_registered_at, amount_snapshot, settlement_id').eq('mentor_id', mentorId).in('case_id', chunk).range(from, to),
    ),
    fetchAllIn<{ id: string; case_id: string; kind: string; status: string; net: number; gross: number; paid_at: string | null; confirmed_at?: string | null }>(ids, (chunk, from, to) =>
      admin.from('settlements').select('id, case_id, kind, status, net, gross, paid_at').eq('mentor_id', mentorId).neq('status', 'canceled').in('case_id', chunk).range(from, to),
    ),
    admin.from('support_types').select('id, name').eq('program_id', programId),
  ]);
  const groupName = new Map((groups.data ?? []).map((g) => [g.id, g.name]));
  const items: MentorHistoryItem[] = [];
  for (const c of cases) {
    const myLogs = logs.filter((l) => l.case_id === c.id).sort((a, b) => a.round_no - b.round_no);
    const mySets = sets.filter((s) => s.case_id === c.id);
    if (myLogs.length === 0 && mySets.length === 0) continue;
    const end = lastEnded.get(c.id)!;
    items.push({
      caseId: c.id,
      menteeName: menteeLabel(c.owner_name, c.business_name),
      groupName: groupName.get(c.support_type_id) ?? null,
      caseStatus: c.status,
      endKind: end.end_kind,
      endedAt: end.ended_at ?? c.closed_at,
      // 케이스 화면 열람 = 끝까지 담당한 멘토만(RLS was_final_mentor_of 와 같은 기준)
      canOpenCase: end.end_kind === 'case_closed' || end.end_kind === 'case_withdrawn',
      rounds: myLogs.map((l) => ({ roundNo: l.round_no, startedAt: l.started_at, endedAt: l.ended_at, mode: l.mode === 'offline' ? 'offline' : 'online', reported: !!l.report_registered_at, amount: Number(l.amount_snapshot ?? 0), settled: !!l.settlement_id })),
      settlements: mySets.map((s) => ({ kind: s.kind, status: s.status, net: Number(s.net), gross: Number(s.gross), paidAt: s.paid_at })),
      status: mentorHistoryStatus(mySets.map((s) => s.status)),
    });
  }
  items.sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? '') || a.menteeName.localeCompare(b.menteeName, 'ko'));
  return items;
}
