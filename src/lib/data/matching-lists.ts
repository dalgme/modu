import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { listCases } from '@/lib/data/cases';
import { CASE_STATUS_META, CASE_STATUSES, type CaseStatus } from '@/types/case-status';
import { AUTO_MATCH_VERSION } from '@/lib/matching/auto-match';
import { canTransition } from '@/lib/workflow/transitions';
import { menteeLabel } from '@/lib/utils/labels';
import type { MatchMethod } from '@/lib/workflow/cases';

/**
 * P24·P25·P27 매칭 리스트 (회원 명단 탭 · 리포트 멘토 진행현황) — 멘토 기준 / 멘티 기준.
 * 범위(행사 전체/그룹)는 호출부 컨텍스트. 멘토 행에는 연락처·지급서류 상태·확정 실지급·만족도·운영사 평가까지 실린다(P27-06·16·17·19).
 */

export type PaymentDocSetState = '-' | 'X' | 'O';

export interface MentorMatchMentee {
  caseId: string;
  label: string;
  groupId: string;
  groupName: string | null;
  /** 멘티 순위 (별도 업로드, P27-01) */
  rank: number | null;
  assignedAt: string | null;
  confirmedAt: string | null;
  matchMethod: MatchMethod | null;
  status: CaseStatus;
  statusLabel: string;
  withdrawn: boolean;
  roundsDone: number;
  requiredRounds: number;
  /** 이 멘티가 남긴 만족도 점수 (없으면 null) */
  surveyScore: number | null;
  /** 배정 관리 버튼 조건 — UI·서버 게이트가 같은 전이 상수를 읽는다 */
  canRecall: boolean;
  canReassign: boolean;
}

export interface MentorReviewItem {
  id: string;
  groupId: string;
  groupName: string;
  rating: number | null;
  memo: string | null;
  authorName: string;
  createdAt: string;
}

export interface MentorMatchRow {
  mentorId: string;
  mentorName: string;
  organization: string | null;
  phone: string | null;
  email: string | null;
  expertise: string[];
  /** 그룹 지정 (비어 있으면 모든 그룹에서 사용) */
  designatedGroupNames: string[];
  mentees: MentorMatchMentee[];
  /** 지급서류 셋트 상태 (-/X/O, 3종 통합 — P27-16) */
  paymentDocState: PaymentDocSetState;
  /** 확정 실지급 합계 (조회 범위) */
  settledNet: number;
  /** 이행 회차 합계 (조회 범위) */
  roundsDone: number;
  surveyAvg: number | null;
  reviewAvg: number | null;
  reviews: MentorReviewItem[];
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
  /** 멘티 순위 (P27-01) */
  rank: number | null;
  groupId: string;
  groupName: string | null;
  status: CaseStatus;
  statusLabel: string;
  statusIndex: number;
  withdrawn: boolean;
  roundsDone: number;
  requiredRounds: number;
  mentorId: string | null;
  mentorName: string | null;
  mentorActive: number;
  mentorExpertise: string[];
  assignedAt: string | null;
  confirmedAt: string | null;
  /** 매칭 방식 (P27-08) */
  matchMethod: MatchMethod | null;
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

export const MATCH_METHOD_LABELS: Record<MatchMethod, string> = {
  auto_preferred: '자동(멘티 희망)',
  recommended: '추천',
  manual: '수동',
};

/** 3종 상태를 셋트 하나로: 하나라도 O 면 O, 하나라도 X 면 X, 아니면 - (P27-16 단일 버튼) */
function docSetState(d: { resume_state: string | null; bankbook_state: string | null; id_card_state: string | null } | undefined): PaymentDocSetState {
  if (!d) return '-';
  const states = [d.resume_state, d.bankbook_state, d.id_card_state];
  if (states.every((s) => s === 'O')) return 'O';
  if (states.some((s) => s === 'O' || s === 'X')) return 'X';
  return '-';
}

export async function loadMatchingLists(programId: string, supportTypeId?: string | null): Promise<MatchingLists> {
  const admin = createAdminClient();
  const cases = await listCases({ programId, supportTypeId: supportTypeId ?? undefined });
  const caseIds = cases.map((c) => c.id);

  const [{ data: assigns }, { data: profiles }, { data: responses }, { data: recs }, { data: mentorMembers }, { data: roster }, { data: settlements }, { data: docs }, { data: reviews }] = await Promise.all([
    caseIds.length
      ? admin.from('mentor_assignments').select('case_id, mentor_id, assigned_at, confirmed_at, match_method').eq('is_active', true).in('case_id', caseIds)
      : Promise.resolve({ data: [] as { case_id: string; mentor_id: string; assigned_at: string; confirmed_at: string | null; match_method: string | null }[] }),
    caseIds.length
      ? admin.from('mentee_profiles').select('case_id, preferred_mentor, needs, rank').in('case_id', caseIds)
      : Promise.resolve({ data: [] as { case_id: string; preferred_mentor: string | null; needs: string[]; rank: number | null }[] }),
    caseIds.length ? admin.from('survey_responses').select('case_id, score').in('case_id', caseIds) : Promise.resolve({ data: [] as { case_id: string; score: number | null }[] }),
    caseIds.length
      ? admin
          .from('match_recommendations')
          .select('case_id, mentor_id, rank, score, rationale, users!match_recommendations_mentor_id_fkey(name)')
          .eq('prompt_version', AUTO_MATCH_VERSION)
          .is('adopted_at', null)
          .in('case_id', caseIds)
          .order('rank')
      : Promise.resolve({ data: [] as unknown[] }),
    admin.from('program_members').select('user_id, users!inner(id, name, organization, phone, email, is_active)').eq('program_id', programId).eq('role', 'mentor').eq('is_active', true),
    admin.from('support_type_members').select('user_id, support_type_id, support_types!inner(name, program_id)').eq('is_active', true).eq('member_role', 'mentor').eq('support_types.program_id', programId),
    caseIds.length ? admin.from('settlements').select('case_id, mentor_id, net').in('case_id', caseIds).neq('status', 'canceled') : Promise.resolve({ data: [] as { case_id: string; mentor_id: string; net: number }[] }),
    admin.from('mentor_payment_docs').select('user_id, resume_state, bankbook_state, id_card_state').eq('program_id', programId),
    admin.from('mentor_group_reviews').select('id, mentor_id, support_type_id, rating, memo, author_id, created_at').eq('program_id', programId).is('deleted_at', null).order('created_at', { ascending: false }),
  ]);

  const assignByCase = new Map((assigns ?? []).map((a) => [a.case_id, a]));
  const profileByCase = new Map((profiles ?? []).map((p) => [p.case_id, p]));
  const scoreByCase = new Map((responses ?? []).map((r) => [r.case_id, r.score]));
  const surveyed = new Set((responses ?? []).map((r) => r.case_id));
  const docByUser = new Map((docs ?? []).map((d) => [d.user_id, d]));

  const mentors = (mentorMembers ?? [])
    .map((m) => m.users as unknown as { id: string; name: string; organization: string | null; phone: string | null; email: string | null; is_active: boolean })
    .filter((u) => u.is_active);
  const mentorIds = mentors.map((m) => m.id);
  const authorIds = Array.from(new Set((reviews ?? []).map((r) => r.author_id)));
  const [{ data: mentorProfiles }, { data: authors }, { data: groups }] = await Promise.all([
    mentorIds.length ? admin.from('mentor_profiles').select('user_id, expertise').eq('program_id', programId).in('user_id', mentorIds) : Promise.resolve({ data: [] as { user_id: string; expertise: string[] }[] }),
    authorIds.length ? admin.from('users').select('id, name').in('id', authorIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    admin.from('support_types').select('id, name').eq('program_id', programId),
  ]);
  const expertiseByMentor = new Map((mentorProfiles ?? []).map((p) => [p.user_id, p.expertise ?? []]));
  const authorName = new Map((authors ?? []).map((a) => [a.id, a.name]));
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
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

  const asMethod = (v: string | null | undefined): MatchMethod | null => (v === 'auto_preferred' || v === 'recommended' || v === 'manual' ? v : null);

  const menteesByMentor = new Map<string, MentorMatchMentee[]>();
  const menteeRows: MenteeMatchRow[] = cases
    .map((c) => {
      const a = assignByCase.get(c.id);
      const p = profileByCase.get(c.id);
      const statusLabel = c.status === 'withdrawn' ? '중도 종료' : CASE_STATUS_META[c.status].short;
      const label = menteeLabel(c.owner_name, c.business_name);
      const rank = typeof p?.rank === 'number' ? p.rank : null;
      if (a) {
        (menteesByMentor.get(a.mentor_id) ?? menteesByMentor.set(a.mentor_id, []).get(a.mentor_id)!).push({
          caseId: c.id,
          label,
          groupId: c.support_type_id,
          groupName: c.supportTypeName,
          rank,
          assignedAt: a.assigned_at,
          confirmedAt: a.confirmed_at,
          matchMethod: asMethod(a.match_method),
          status: c.status,
          statusLabel,
          withdrawn: c.status === 'withdrawn',
          roundsDone: c.roundsDone,
          requiredRounds: c.requiredRounds,
          surveyScore: typeof scoreByCase.get(c.id) === 'number' ? (scoreByCase.get(c.id) as number) : null,
          canRecall: canTransition('recall_mentor', c.status),
          canReassign: canTransition('reassign_mentor', c.status),
        });
      }
      return {
        caseId: c.id,
        label,
        menteeName: c.owner_name,
        rank,
        groupId: c.support_type_id,
        groupName: c.supportTypeName,
        status: c.status,
        statusLabel,
        statusIndex: CASE_STATUSES.indexOf(c.status),
        withdrawn: c.status === 'withdrawn',
        roundsDone: c.roundsDone,
        requiredRounds: c.requiredRounds,
        mentorId: c.mentorId,
        mentorName: c.mentorName,
        mentorActive: c.mentorId ? (activeByMentor.get(c.mentorId) ?? 0) : 0,
        mentorExpertise: c.mentorId ? (expertiseByMentor.get(c.mentorId) ?? []) : [],
        assignedAt: a?.assigned_at ?? null,
        confirmedAt: a?.confirmed_at ?? null,
        matchMethod: asMethod(a?.match_method),
        surveyDone: surveyed.has(c.id),
        preferredMentor: p?.preferred_mentor ?? null,
        needs: (p?.needs ?? []).slice(0, 6),
        recommendations: recsByCase.get(c.id) ?? [],
        canConfirm: canTransition('assign_mentor', c.status),
      };
    })
    // 기본 정렬: 순위(없으면 뒤) → 이름 가나다
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.menteeName.localeCompare(b.menteeName, 'ko'));

  const scopedCaseIds = new Set(caseIds);
  const mentorRows: MentorMatchRow[] = mentors
    .map((m) => {
      const mentees = (menteesByMentor.get(m.id) ?? []).sort((a, b) => (a.assignedAt ?? '').localeCompare(b.assignedAt ?? ''));
      const scores = mentees.map((x) => x.surveyScore).filter((s): s is number => typeof s === 'number');
      const myReviews = (reviews ?? [])
        .filter((r) => r.mentor_id === m.id && (!supportTypeId || r.support_type_id === supportTypeId))
        .map((r) => ({ id: r.id, groupId: r.support_type_id, groupName: groupName.get(r.support_type_id) ?? '-', rating: r.rating, memo: r.memo, authorName: authorName.get(r.author_id) ?? '-', createdAt: r.created_at }));
      const ratings = myReviews.map((r) => r.rating).filter((x): x is number => typeof x === 'number');
      return {
        mentorId: m.id,
        mentorName: m.name,
        organization: m.organization,
        phone: m.phone,
        email: m.email,
        expertise: expertiseByMentor.get(m.id) ?? [],
        designatedGroupNames: (designatedByMentor.get(m.id) ?? []).map((g) => g.name),
        mentees,
        paymentDocState: docSetState(docByUser.get(m.id)),
        settledNet: (settlements ?? []).filter((s) => s.mentor_id === m.id && scopedCaseIds.has(s.case_id)).reduce((a, s) => a + Number(s.net), 0),
        roundsDone: mentees.reduce((a, x) => a + x.roundsDone, 0),
        surveyAvg: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
        reviewAvg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
        reviews: myReviews,
      };
    })
    // 그룹 범위: 지정 없음(모든 그룹) · 이 그룹 지정 · 이 그룹에 배정 있음
    .filter((m) => !supportTypeId || (designatedByMentor.get(m.mentorId) ?? []).length === 0 || (designatedByMentor.get(m.mentorId) ?? []).some((g) => g.id === supportTypeId) || m.mentees.length > 0)
    .sort((a, b) => a.mentorName.localeCompare(b.mentorName, 'ko'));

  return { mentorRows, menteeRows };
}
