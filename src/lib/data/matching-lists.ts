import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { listCases } from '@/lib/data/cases';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { AUTO_MATCH_VERSION } from '@/lib/matching/auto-match';
import { canTransition } from '@/lib/workflow/transitions';
import { menteeLabel } from '@/lib/utils/labels';

/** P24·P25 매칭 리스트 (회원 명단 탭) — 멘토 기준 / 멘티 기준. 범위(행사 전체/그룹)는 호출부 컨텍스트. */

export interface MentorMatchMentee {
  caseId: string;
  label: string;
  groupName: string | null;
  assignedAt: string | null;
  confirmedAt: string | null;
  status: CaseStatus;
  statusLabel: string;
  roundsDone: number;
  requiredRounds: number;
  /** 배정 관리 버튼 조건 — UI·서버 게이트가 같은 전이 상수를 읽는다 */
  canRecall: boolean;
  canReassign: boolean;
}

export interface MentorMatchRow {
  mentorId: string;
  mentorName: string;
  organization: string | null;
  expertise: string[];
  /** 그룹 지정 (비어 있으면 모든 그룹에서 사용) */
  designatedGroupNames: string[];
  mentees: MentorMatchMentee[];
}

export interface MenteeMatchRecommendation {
  mentorId: string;
  mentorName: string;
  /** 이 멘토의 현재 확정 배정 멘티 수 (조회 범위 기준) */
  mentorActive: number;
  rank: number;
  score: number;
  rationale: string | null;
  expertise: string[];
}

export interface MenteeMatchRow {
  caseId: string;
  label: string;
  menteeName: string;
  groupId: string;
  groupName: string | null;
  status: CaseStatus;
  statusLabel: string;
  withdrawn: boolean;
  roundsDone: number;
  requiredRounds: number;
  mentorId: string | null;
  mentorName: string | null;
  mentorActive: number;
  mentorExpertise: string[];
  assignedAt: string | null;
  confirmedAt: string | null;
  surveyDone: boolean;
  preferredMentor: string | null;
  needs: string[];
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

  const [{ data: assigns }, { data: profiles }, { data: responses }, { data: recs }, { data: mentorMembers }, { data: roster }] = await Promise.all([
    caseIds.length
      ? admin.from('mentor_assignments').select('case_id, mentor_id, assigned_at, confirmed_at').eq('is_active', true).in('case_id', caseIds)
      : Promise.resolve({ data: [] as { case_id: string; mentor_id: string; assigned_at: string; confirmed_at: string | null }[] }),
    caseIds.length
      ? admin.from('mentee_profiles').select('case_id, preferred_mentor, needs').in('case_id', caseIds)
      : Promise.resolve({ data: [] as { case_id: string; preferred_mentor: string | null; needs: string[] }[] }),
    caseIds.length ? admin.from('survey_responses').select('case_id').in('case_id', caseIds) : Promise.resolve({ data: [] as { case_id: string }[] }),
    caseIds.length
      ? admin
          .from('match_recommendations')
          .select('case_id, mentor_id, rank, score, rationale, users!match_recommendations_mentor_id_fkey(name)')
          .eq('prompt_version', AUTO_MATCH_VERSION)
          .is('adopted_at', null)
          .in('case_id', caseIds)
          .order('rank')
      : Promise.resolve({ data: [] as unknown[] }),
    admin.from('program_members').select('user_id, users!inner(id, name, organization, is_active)').eq('program_id', programId).eq('role', 'mentor').eq('is_active', true),
    admin.from('support_type_members').select('user_id, support_type_id, support_types!inner(name, program_id)').eq('is_active', true).eq('member_role', 'mentor').eq('support_types.program_id', programId),
  ]);

  const assignByCase = new Map((assigns ?? []).map((a) => [a.case_id, a]));
  const profileByCase = new Map((profiles ?? []).map((p) => [p.case_id, p]));
  const surveyed = new Set((responses ?? []).map((r) => r.case_id));

  const mentors = (mentorMembers ?? [])
    .map((m) => m.users as unknown as { id: string; name: string; organization: string | null; is_active: boolean })
    .filter((u) => u.is_active);
  const mentorIds = mentors.map((m) => m.id);
  const { data: mentorProfiles } = mentorIds.length
    ? await admin.from('mentor_profiles').select('user_id, expertise').eq('program_id', programId).in('user_id', mentorIds)
    : { data: [] as { user_id: string; expertise: string[] }[] };
  const expertiseByMentor = new Map((mentorProfiles ?? []).map((p) => [p.user_id, p.expertise ?? []]));
  const designatedByMentor = new Map<string, { id: string; name: string }[]>();
  for (const r of roster ?? []) {
    const name = (r.support_types as unknown as { name: string } | null)?.name ?? '-';
    (designatedByMentor.get(r.user_id) ?? designatedByMentor.set(r.user_id, []).get(r.user_id)!).push({ id: r.support_type_id, name });
  }

  // 멘토별 확정 배정 수 (조회 범위 기준) — 이름(n) 표기
  const activeByMentor = new Map<string, number>();
  for (const c of cases) if (c.mentorId && c.status !== 'withdrawn') activeByMentor.set(c.mentorId, (activeByMentor.get(c.mentorId) ?? 0) + 1);

  const recsByCase = new Map<string, MenteeMatchRecommendation[]>();
  for (const raw of (recs ?? []) as { case_id: string; mentor_id: string; rank: number; score: number; rationale: string | null; users: { name: string } | null }[]) {
    (recsByCase.get(raw.case_id) ?? recsByCase.set(raw.case_id, []).get(raw.case_id)!).push({
      mentorId: raw.mentor_id,
      mentorName: raw.users?.name ?? '-',
      mentorActive: activeByMentor.get(raw.mentor_id) ?? 0,
      rank: raw.rank,
      score: Number(raw.score),
      rationale: raw.rationale,
      expertise: expertiseByMentor.get(raw.mentor_id) ?? [],
    });
  }

  const menteesByMentor = new Map<string, MentorMatchMentee[]>();
  const menteeRows: MenteeMatchRow[] = cases
    .map((c) => {
      const a = assignByCase.get(c.id);
      const p = profileByCase.get(c.id);
      const statusLabel = c.status === 'withdrawn' ? '중도 종료' : CASE_STATUS_META[c.status].short;
      const label = menteeLabel(c.owner_name, c.business_name);
      if (a) {
        (menteesByMentor.get(a.mentor_id) ?? menteesByMentor.set(a.mentor_id, []).get(a.mentor_id)!).push({
          caseId: c.id,
          label,
          groupName: c.supportTypeName,
          assignedAt: a.assigned_at,
          confirmedAt: a.confirmed_at,
          status: c.status,
          statusLabel,
          roundsDone: c.roundsDone,
          requiredRounds: c.requiredRounds,
          canRecall: canTransition('recall_mentor', c.status),
          canReassign: canTransition('reassign_mentor', c.status),
        });
      }
      return {
        caseId: c.id,
        label,
        menteeName: c.owner_name,
        groupId: c.support_type_id,
        groupName: c.supportTypeName,
        status: c.status,
        statusLabel,
        withdrawn: c.status === 'withdrawn',
        roundsDone: c.roundsDone,
        requiredRounds: c.requiredRounds,
        mentorId: c.mentorId,
        mentorName: c.mentorName,
        mentorActive: c.mentorId ? (activeByMentor.get(c.mentorId) ?? 0) : 0,
        mentorExpertise: c.mentorId ? (expertiseByMentor.get(c.mentorId) ?? []) : [],
        assignedAt: a?.assigned_at ?? null,
        confirmedAt: a?.confirmed_at ?? null,
        surveyDone: surveyed.has(c.id),
        preferredMentor: p?.preferred_mentor ?? null,
        needs: (p?.needs ?? []).slice(0, 6),
        recommendations: recsByCase.get(c.id) ?? [],
        canConfirm: canTransition('assign_mentor', c.status),
      };
    })
    .sort((a, b) => a.menteeName.localeCompare(b.menteeName, 'ko'));

  const mentorRows: MentorMatchRow[] = mentors
    .map((m) => ({
      mentorId: m.id,
      mentorName: m.name,
      organization: m.organization,
      expertise: expertiseByMentor.get(m.id) ?? [],
      designatedGroupNames: (designatedByMentor.get(m.id) ?? []).map((g) => g.name),
      mentees: (menteesByMentor.get(m.id) ?? []).sort((a, b) => (a.assignedAt ?? '').localeCompare(b.assignedAt ?? '')),
    }))
    // 그룹 범위: 지정 없음(모든 그룹) · 이 그룹 지정 · 이 그룹에 배정 있음
    .filter((m) => !supportTypeId || (designatedByMentor.get(m.mentorId) ?? []).length === 0 || (designatedByMentor.get(m.mentorId) ?? []).some((g) => g.id === supportTypeId) || m.mentees.length > 0)
    .sort((a, b) => a.mentorName.localeCompare(b.mentorName, 'ko'));

  return { mentorRows, menteeRows };
}
