import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/** 스케줄 달력 이벤트 — 회차(계획/실행) 1건 (P20) */
export interface ScheduleEvent {
  id: string;
  caseId: string;
  roundNo: number;
  ownerName: string;
  businessName: string;
  mentorName: string | null;
  mode: 'online' | 'offline';
  startedAt: string;
  endedAt: string;
  place: string | null;
  /** 보고서(2단계)까지 등록 = 완료 */
  reported: boolean;
}

interface CaseLite {
  id: string;
  owner_name: string;
  business_name: string;
}

async function eventsForCases(cases: CaseLite[], mentorNameByCase?: Map<string, string | null>): Promise<ScheduleEvent[]> {
  if (cases.length === 0) return [];
  const admin = createAdminClient();
  const byId = new Map(cases.map((c) => [c.id, c]));
  const { data: logs } = await admin
    .from('mentoring_logs')
    .select('id, case_id, round_no, mode, started_at, ended_at, place, report_registered_at, mentor_id')
    .in('case_id', Array.from(byId.keys()))
    .order('started_at', { ascending: true });
  const mentorIds = Array.from(new Set((logs ?? []).map((l) => l.mentor_id).filter(Boolean))) as string[];
  const { data: mentors } = mentorIds.length
    ? await admin.from('users').select('id, name').in('id', mentorIds)
    : { data: [] as { id: string; name: string }[] };
  const mentorName = new Map((mentors ?? []).map((m) => [m.id, m.name]));
  return (logs ?? []).map((l) => {
    const c = byId.get(l.case_id)!;
    return {
      id: l.id,
      caseId: l.case_id,
      roundNo: l.round_no,
      ownerName: c.owner_name,
      businessName: c.business_name,
      mentorName: mentorNameByCase?.get(l.case_id) ?? (l.mentor_id ? (mentorName.get(l.mentor_id) ?? null) : null),
      mode: (l.mode as 'online' | 'offline') ?? 'online',
      startedAt: l.started_at,
      endedAt: l.ended_at,
      place: l.place,
      reported: !!l.report_registered_at,
    };
  });
}

/** 멘토: 배정(활성) 케이스 전체의 회차 일정 */
export async function listMentorSchedule(mentorId: string, programId: string): Promise<ScheduleEvent[]> {
  const admin = createAdminClient();
  const { data: assigns } = await admin
    .from('mentor_assignments')
    .select('case_id, cases!inner(id, owner_name, business_name, program_id)')
    .eq('mentor_id', mentorId)
    .eq('is_active', true);
  const cases = (assigns ?? [])
    .map((a) => a.cases as unknown as (CaseLite & { program_id: string }))
    .filter((c) => c && c.program_id === programId);
  return eventsForCases(cases);
}

/** 멘티: 본인 케이스의 회차 일정 (멘토가 등록한 예약·완료) */
export async function listMenteeSchedule(menteeId: string, programId: string): Promise<ScheduleEvent[]> {
  const admin = createAdminClient();
  const { data: cases } = await admin
    .from('cases')
    .select('id, owner_name, business_name')
    .eq('program_id', programId)
    .eq('mentee_id', menteeId);
  return eventsForCases(cases ?? []);
}
