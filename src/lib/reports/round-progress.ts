import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { listSupportTypes } from '@/lib/programs/data';
import { loadInactiveMemberIds } from '@/lib/data/inactive-members';
import { computeRoundProgress, type RoundProgressResult } from '@/lib/reports/round-progress-shared';

/**
 * 회차별 진행 현황 데이터 (2026-11-03) — 리포트 [회차별 현황] 탭과 엑셀이 같이 쓴다.
 * 다른 리포트 탭과 달리 비활성화된 멘티를 빼지 않고 '포기'로 분류한다(운영에서 포기 = 비활성화 처리가 많음).
 */
export async function loadRoundProgress(programId: string, supportTypeId?: string | null, now = new Date()): Promise<RoundProgressResult> {
  const admin = createAdminClient();
  const [allGroups, inactive] = await Promise.all([listSupportTypes(programId), loadInactiveMemberIds(programId, 'mentee')]);
  const groups = supportTypeId ? allGroups.filter((g) => g.id === supportTypeId) : allGroups;
  const groupIds = groups.map((g) => g.id);

  const cases = await fetchAllIn<{ id: string; support_type_id: string; status: string; mentee_id: string | null; owner_name: string; business_name: string }>(groupIds, (chunk, from, to) =>
    admin.from('cases').select('id, support_type_id, status, mentee_id, owner_name, business_name').eq('program_id', programId).in('support_type_id', chunk).order('created_at').range(from, to),
  );
  const caseIds = cases.map((c) => c.id);
  const [logs, assignments] = await Promise.all([
    fetchAllIn<{ case_id: string; round_no: number; started_at: string; ended_at: string | null; report_registered_at: string | null; mentor_id: string | null }>(caseIds, (chunk, from, to) =>
      admin.from('mentoring_logs').select('case_id, round_no, started_at, ended_at, report_registered_at, mentor_id').in('case_id', chunk).order('id').range(from, to),
    ),
    fetchAllIn<{ case_id: string; mentor_id: string; is_active: boolean; end_kind: string | null }>(caseIds, (chunk, from, to) =>
      admin.from('mentor_assignments').select('case_id, mentor_id, is_active, end_kind').in('case_id', chunk).order('id').range(from, to),
    ),
  ]);
  const active = new Map<string, string>();
  const finals = new Map<string, string[]>();
  for (const a of assignments) {
    if (a.is_active) active.set(a.case_id, a.mentor_id);
    else if (a.end_kind === 'case_closed' || a.end_kind === 'case_withdrawn') finals.set(a.case_id, [...(finals.get(a.case_id) ?? []), a.mentor_id]);
  }

  return computeRoundProgress({
    groups: groups.map((g) => ({ id: g.id, name: g.name, requiredRounds: g.required_rounds ?? 0 })),
    cases: cases.map((c) => ({
      id: c.id,
      groupId: c.support_type_id,
      status: c.status,
      menteeName: c.owner_name,
      businessName: c.business_name,
      inactive: !!c.mentee_id && inactive.has(c.mentee_id),
      activeMentorId: active.get(c.id) ?? null,
      finalMentorIds: finals.get(c.id) ?? [],
    })),
    logs: logs.map((l) => ({ caseId: l.case_id, roundNo: l.round_no, startedAt: l.started_at, endedAt: l.ended_at, reportAt: l.report_registered_at, mentorId: l.mentor_id })),
    now,
  });
}
