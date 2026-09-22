import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { listCases } from '@/lib/data/cases';
import { CASE_STATUS_META } from '@/types/case-status';
import { AUTO_MATCH_VERSION } from '@/lib/matching/auto-match';

/** P24 매칭 리스트 (회원 명단 탭) — 멘토 기준 / 멘티 기준 */

export interface MentorMatchMentee {
  caseId: string;
  menteeName: string;
  businessName: string;
  groupName: string | null;
  assignedAt: string | null;
  confirmedAt: string | null;
  statusLabel: string;
  roundsDone: number;
  requiredRounds: number;
}

export interface MentorMatchRow {
  mentorId: string;
  mentorName: string;
  organization: string | null;
  expertise: string[];
  mentees: MentorMatchMentee[];
}

export interface MenteeMatchRecommendation {
  mentorId: string;
  mentorName: string;
  rank: number;
  rationale: string | null;
}

export interface MenteeMatchRow {
  caseId: string;
  menteeName: string;
  businessName: string;
  groupName: string | null;
  statusLabel: string;
  withdrawn: boolean;
  mentorName: string | null;
  assignedAt: string | null;
  confirmedAt: string | null;
  surveyDone: boolean;
  preferredMentor: string | null;
  recommendations: MenteeMatchRecommendation[];
  canConfirm: boolean;
}

export interface MatchingLists {
  mentorRows: MentorMatchRow[];
  menteeRows: MenteeMatchRow[];
}

export async function loadMatchingLists(programId: string, supportTypeId?: string | null): Promise<MatchingLists> {
  const admin = createAdminClient();
  const cases = await listCases({ programId, supportTypeId: supportTypeId ?? undefined });
  const caseIds = cases.map((c) => c.id);

  const [{ data: assigns }, { data: profiles }, { data: responses }, { data: recs }, { data: mentorMembers }] = await Promise.all([
    caseIds.length
      ? admin.from('mentor_assignments').select('case_id, mentor_id, assigned_at, confirmed_at').eq('is_active', true).in('case_id', caseIds)
      : Promise.resolve({ data: [] as { case_id: string; mentor_id: string; assigned_at: string; confirmed_at: string | null }[] }),
    caseIds.length
      ? admin.from('mentee_profiles').select('case_id, preferred_mentor').in('case_id', caseIds)
      : Promise.resolve({ data: [] as { case_id: string; preferred_mentor: string | null }[] }),
    caseIds.length
      ? admin.from('survey_responses').select('case_id').in('case_id', caseIds)
      : Promise.resolve({ data: [] as { case_id: string }[] }),
    caseIds.length
      ? admin
          .from('match_recommendations')
          .select('case_id, mentor_id, rank, rationale, prompt_version, adopted_at, users!match_recommendations_mentor_id_fkey(name)')
          .eq('prompt_version', AUTO_MATCH_VERSION)
          .is('adopted_at', null)
          .in('case_id', caseIds)
          .order('rank')
      : Promise.resolve({ data: [] as unknown[] }),
    admin
      .from('program_members')
      .select('user_id, users!inner(id, name, organization, is_active)')
      .eq('program_id', programId)
      .eq('role', 'mentor')
      .eq('is_active', true),
  ]);

  const assignByCase = new Map((assigns ?? []).map((a) => [a.case_id, a]));
  const preferredByCase = new Map((profiles ?? []).map((p) => [p.case_id, p.preferred_mentor]));
  const surveyed = new Set((responses ?? []).map((r) => r.case_id));

  const recsByCase = new Map<string, MenteeMatchRecommendation[]>();
  for (const raw of (recs ?? []) as { case_id: string; mentor_id: string; rank: number; rationale: string | null; users: { name: string } | null }[]) {
    (recsByCase.get(raw.case_id) ?? recsByCase.set(raw.case_id, []).get(raw.case_id)!).push({
      mentorId: raw.mentor_id,
      mentorName: raw.users?.name ?? '-',
      rank: raw.rank,
      rationale: raw.rationale,
    });
  }

  const mentors = (mentorMembers ?? [])
    .map((m) => m.users as unknown as { id: string; name: string; organization: string | null; is_active: boolean })
    .filter((u) => u.is_active);
  const mentorIds = mentors.map((m) => m.id);
  const { data: mentorProfiles } = mentorIds.length
    ? await admin.from('mentor_profiles').select('user_id, expertise').eq('program_id', programId).in('user_id', mentorIds)
    : { data: [] as { user_id: string; expertise: string[] }[] };
  const expertiseByMentor = new Map((mentorProfiles ?? []).map((p) => [p.user_id, p.expertise ?? []]));

  const menteesByMentor = new Map<string, MentorMatchMentee[]>();
  const menteeRows: MenteeMatchRow[] = cases.map((c) => {
    const a = assignByCase.get(c.id);
    const statusLabel = c.status === 'withdrawn' ? '중도 종료' : CASE_STATUS_META[c.status].short;
    if (a) {
      (menteesByMentor.get(a.mentor_id) ?? menteesByMentor.set(a.mentor_id, []).get(a.mentor_id)!).push({
        caseId: c.id,
        menteeName: c.owner_name,
        businessName: c.business_name,
        groupName: c.supportTypeName,
        assignedAt: a.assigned_at,
        confirmedAt: a.confirmed_at,
        statusLabel,
        roundsDone: c.roundsDone,
        requiredRounds: c.requiredRounds,
      });
    }
    return {
      caseId: c.id,
      menteeName: c.owner_name,
      businessName: c.business_name,
      groupName: c.supportTypeName,
      statusLabel,
      withdrawn: c.status === 'withdrawn',
      mentorName: c.mentorName,
      assignedAt: a?.assigned_at ?? null,
      confirmedAt: a?.confirmed_at ?? null,
      surveyDone: surveyed.has(c.id),
      preferredMentor: preferredByCase.get(c.id) ?? null,
      recommendations: recsByCase.get(c.id) ?? [],
      canConfirm: c.status === 'registered' || c.status === 'reassignment_pending',
    };
  });

  const mentorRows: MentorMatchRow[] = mentors
    .map((m) => ({
      mentorId: m.id,
      mentorName: m.name,
      organization: m.organization,
      expertise: expertiseByMentor.get(m.id) ?? [],
      mentees: (menteesByMentor.get(m.id) ?? []).sort((a, b) => (a.assignedAt ?? '').localeCompare(b.assignedAt ?? '')),
    }))
    .sort((a, b) => b.mentees.length - a.mentees.length || a.mentorName.localeCompare(b.mentorName, 'ko'));

  return { mentorRows, menteeRows };
}
