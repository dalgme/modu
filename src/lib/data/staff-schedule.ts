import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { menteeLabel } from '@/lib/utils/labels';
import {
  includeRound,
  roundStatus,
  sortMentors,
  type ScheduleMentor,
  type StaffRound,
  type StaffScheduleCase,
} from '@/lib/data/staff-schedule-shared';

export interface StaffScheduleData {
  rounds: StaffRound[];
  cases: StaffScheduleCase[];
  /** 범위 안에 배정(활성·종료) 또는 회차가 있는 멘토, 가나다순 */
  mentors: ScheduleMentor[];
}

/**
 * 운영사 [스케줄] 탭 데이터 — 행사(+그룹) 범위의 모든 회차.
 * 범위는 RLS 가 아니라 **코드 필터**(program_id · support_type_id)로 강제한다 (CLAUDE.md §6-2).
 * 멘티 400명 × 4회 = 1,600행이라 1,000행 캡을 넘으므로 fetchAll/fetchAllIn 으로 끝까지 읽는다.
 */
export async function loadStaffSchedule(programId: string, supportTypeId: string | null, nowMs: number = Date.now()): Promise<StaffScheduleData> {
  const admin = createAdminClient();

  const [groups, caseRows] = await Promise.all([
    admin.from('support_types').select('id, name, required_rounds').eq('program_id', programId),
    fetchAll<{ id: string; owner_name: string; business_name: string; phone: string; status: string; support_type_id: string }>((from, to) => {
      let q = admin.from('cases').select('id, owner_name, business_name, phone, status, support_type_id').eq('program_id', programId);
      if (supportTypeId) q = q.eq('support_type_id', supportTypeId);
      return q.order('id').range(from, to);
    }),
  ]);
  if (groups.error) throw new Error(groups.error.message);
  const groupById = new Map((groups.data ?? []).map((g) => [g.id, g]));
  const caseIds = caseRows.map((c) => c.id);
  if (caseIds.length === 0) return { rounds: [], cases: [], mentors: [] };

  const [assigns, logs, extensions] = await Promise.all([
    fetchAllIn<{ case_id: string; mentor_id: string; is_active: boolean }>(caseIds, (chunk, from, to) =>
      admin.from('mentor_assignments').select('case_id, mentor_id, is_active').in('case_id', chunk).order('id').range(from, to),
    ),
    fetchAllIn<{ id: string; case_id: string; mentor_id: string; round_no: number; mode: 'online' | 'offline'; started_at: string; ended_at: string; place: string | null; report_registered_at: string | null }>(caseIds, (chunk, from, to) =>
      admin
        .from('mentoring_logs')
        .select('id, case_id, mentor_id, round_no, mode, started_at, ended_at, place, report_registered_at')
        .in('case_id', chunk)
        .order('id')
        .range(from, to),
    ),
    fetchAllIn<{ case_id: string; extra_rounds: number }>(caseIds, (chunk, from, to) =>
      admin.from('round_extension_requests').select('case_id, extra_rounds').in('case_id', chunk).eq('status', 'approved').order('id').range(from, to),
    ),
  ]);

  const extraByCase = new Map<string, number>();
  for (const e of extensions) extraByCase.set(e.case_id, (extraByCase.get(e.case_id) ?? 0) + (e.extra_rounds ?? 0));

  const activeMentorByCase = new Map<string, string>();
  const mentorsByCase = new Map<string, Set<string>>();
  for (const a of assigns) {
    if (a.is_active) activeMentorByCase.set(a.case_id, a.mentor_id);
    (mentorsByCase.get(a.case_id) ?? mentorsByCase.set(a.case_id, new Set()).get(a.case_id)!).add(a.mentor_id);
  }
  for (const l of logs) (mentorsByCase.get(l.case_id) ?? mentorsByCase.set(l.case_id, new Set()).get(l.case_id)!).add(l.mentor_id);

  const mentorIds = Array.from(new Set(Array.from(mentorsByCase.values()).flatMap((s) => Array.from(s))));
  const users = await fetchAllIn<{ id: string; name: string; phone: string | null }>(mentorIds, (chunk, from, to) =>
    admin.from('users').select('id, name, phone').in('id', chunk).order('id').range(from, to),
  );
  const userById = new Map(users.map((u) => [u.id, u]));

  const cases: StaffScheduleCase[] = caseRows.map((c) => {
    const g = groupById.get(c.support_type_id);
    return {
      id: c.id,
      menteeLabel: menteeLabel(c.owner_name, c.business_name),
      menteePhone: c.phone || null,
      status: c.status,
      groupName: g?.name ?? '',
      requiredTotal: (g?.required_rounds ?? 0) + (extraByCase.get(c.id) ?? 0),
      activeMentorId: c.status === 'withdrawn' ? null : (activeMentorByCase.get(c.id) ?? null),
      mentorIds: Array.from(mentorsByCase.get(c.id) ?? []),
    };
  });
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const rounds: StaffRound[] = [];
  for (const l of logs) {
    const c = caseById.get(l.case_id);
    if (!c) continue;
    const reported = !!l.report_registered_at;
    if (!includeRound(c.status, reported)) continue;
    const m = userById.get(l.mentor_id);
    rounds.push({
      id: l.id,
      caseId: l.case_id,
      roundNo: l.round_no,
      requiredTotal: c.requiredTotal,
      menteeLabel: c.menteeLabel,
      menteePhone: c.menteePhone,
      mentorId: l.mentor_id,
      mentorName: m?.name ?? '(알 수 없음)',
      mentorPhone: m?.phone ?? null,
      mode: l.mode === 'offline' ? 'offline' : 'online',
      startedAt: l.started_at,
      endedAt: l.ended_at,
      place: l.place,
      reported,
      caseStatus: c.status,
      groupName: c.groupName,
      status: roundStatus({ reported, startedAt: l.started_at }, nowMs),
    });
  }

  const roundCount = new Map<string, number>();
  for (const r of rounds) roundCount.set(r.mentorId, (roundCount.get(r.mentorId) ?? 0) + 1);
  const activeCount = new Map<string, number>();
  for (const c of cases) if (c.activeMentorId) activeCount.set(c.activeMentorId, (activeCount.get(c.activeMentorId) ?? 0) + 1);

  const mentors: ScheduleMentor[] = sortMentors(
    // mentorIds = 범위 케이스에 배정(활성·종료)됐거나 회차를 진행한 멘토 전부
    mentorIds.map((id) => ({
      id,
      name: userById.get(id)?.name ?? '(알 수 없음)',
      phone: userById.get(id)?.phone ?? null,
      roundCount: roundCount.get(id) ?? 0,
      activeCases: activeCount.get(id) ?? 0,
    })),
  );

  return { rounds, cases, mentors };
}
