'use server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { menteeLabel } from '@/lib/utils/labels';

export interface MentorPopupMentee {
  caseId: string;
  label: string;
  groupId: string;
  groupName: string | null;
  statusLabel: string;
  withdrawn: boolean;
  roundsDone: number;
  requiredRounds: number;
  assignedAt: string;
  confirmedAt: string | null;
  /** 이 멘티가 남긴 만족도 점수 (멘토 평가) */
  surveyScore: number | null;
}

export interface MentorPopupReview {
  id: string;
  groupName: string;
  rating: number | null;
  memo: string | null;
  authorName: string;
  createdAt: string;
}

export interface MentorPopupData {
  id: string;
  name: string;
  organization: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  mentorInstitution: string | null;
  expertise: string[];
  regions: string[];
  /** 비고 — 운영사만 (발주처는 null) */
  note: string | null;
  /** 이 행사(범위)에서 확정 배정된 멘티 수 */
  activeCount: number;
  designatedGroups: string[];
  /** 그룹별 매칭 멘티 수 (이 행사 전체) */
  byGroup: { groupName: string; count: number }[];
  mentees: MentorPopupMentee[];
  surveyAvg: number | null;
  /** 운영사 평가 — 운영사만 (발주처는 빈 배열, reviewAvg 도 null) */
  reviews: MentorPopupReview[];
  reviewAvg: number | null;
}

type Result = { ok: true; data: MentorPopupData } | { ok: false; error: string };

/**
 * 멘토 이름 클릭 → 레이어 팝업 데이터 (P25-03 · P27-07 확장).
 * 발주처·운영사 전용, 이 행사 소속 멘토만. 어떤 예외도 삼키지 않고 { ok:false, error } 로 돌려준다(화면에 원인 표시).
 */
export async function getMentorPopupAction(mentorId: string): Promise<Result> {
  try {
    const profile = await realRoleOrNull(['nextlab', 'institution']);
    if (!profile) return { ok: false, error: '발주처·운영사 담당자만 볼 수 있습니다.' };
    const ctx = await contextOrNull(profile);
    if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
    const admin = createAdminClient();
    const isOperator = ctx.role === 'nextlab';

    const [memberR, userR, profR, rosterR, groupsR, assignsR, reviewsR] = await Promise.all([
      admin.from('program_members').select('role').eq('program_id', ctx.programId).eq('user_id', mentorId).maybeSingle(),
      admin.from('users').select('id, name, organization, position, phone, email').eq('id', mentorId).maybeSingle(),
      admin.from('mentor_profiles').select('expertise, regions, mentor_institution, note').eq('program_id', ctx.programId).eq('user_id', mentorId).maybeSingle(),
      admin.from('support_type_members').select('support_type_id').eq('user_id', mentorId).eq('is_active', true).eq('member_role', 'mentor'),
      admin.from('support_types').select('id, name, required_rounds').eq('program_id', ctx.programId),
      admin.from('mentor_assignments').select('case_id, assigned_at, confirmed_at').eq('mentor_id', mentorId).eq('is_active', true).order('assigned_at'),
      isOperator
        ? admin.from('mentor_group_reviews').select('id, support_type_id, rating, memo, author_id, created_at').eq('program_id', ctx.programId).eq('mentor_id', mentorId).is('deleted_at', null).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as { id: string; support_type_id: string; rating: number | null; memo: string | null; author_id: string; created_at: string }[], error: null }),
    ]);
    for (const r of [memberR, userR, profR, rosterR, groupsR, assignsR, reviewsR]) {
      if (r.error) return { ok: false, error: `조회 실패: ${r.error.message}` };
    }
    const member = memberR.data;
    const u = userR.data;
    if (!member || member.role !== 'mentor' || !u) return { ok: false, error: '이 행사의 멘토가 아닙니다.' };
    const groups = groupsR.data ?? [];
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const groupIds = new Set(groups.map((g) => g.id));

    // 배정 케이스 — 이 행사 것만 (케이스 조회는 별도, 조인 필터 대신 코드 필터)
    const assignAll = assignsR.data ?? [];
    const caseIds = assignAll.map((a) => a.case_id);
    const { data: casesRaw, error: caseErr } = caseIds.length
      ? await admin.from('cases').select('id, owner_name, business_name, status, program_id, support_type_id').in('id', caseIds).eq('program_id', ctx.programId)
      : { data: [] as { id: string; owner_name: string; business_name: string; status: CaseStatus; program_id: string; support_type_id: string }[], error: null };
    if (caseErr) return { ok: false, error: `케이스 조회 실패: ${caseErr.message}` };
    const caseById = new Map((casesRaw ?? []).map((c) => [c.id, c]));
    const programAssigns = assignAll.filter((a) => caseById.has(a.case_id));
    const inScope = programAssigns.filter((a) => !ctx.supportTypeId || caseById.get(a.case_id)!.support_type_id === ctx.supportTypeId);
    const scopedIds = inScope.map((a) => a.case_id);

    const [{ data: logs }, { data: responses }] = await Promise.all([
      scopedIds.length ? admin.from('mentoring_logs').select('case_id').in('case_id', scopedIds).not('report_registered_at', 'is', null) : Promise.resolve({ data: [] as { case_id: string }[] }),
      scopedIds.length ? admin.from('survey_responses').select('case_id, score').in('case_id', scopedIds) : Promise.resolve({ data: [] as { case_id: string; score: number | null }[] }),
    ]);
    const rounds = new Map<string, number>();
    for (const l of logs ?? []) rounds.set(l.case_id, (rounds.get(l.case_id) ?? 0) + 1);
    const scoreByCase = new Map((responses ?? []).map((r) => [r.case_id, r.score]));

    const byGroupMap = new Map<string, number>();
    for (const a of programAssigns) {
      const c = caseById.get(a.case_id)!;
      if (c.status === 'withdrawn') continue;
      const name = groupById.get(c.support_type_id)?.name ?? '-';
      byGroupMap.set(name, (byGroupMap.get(name) ?? 0) + 1);
    }

    const authorIds = Array.from(new Set((reviewsR.data ?? []).map((r) => r.author_id)));
    const { data: authors } = authorIds.length ? await admin.from('users').select('id, name').in('id', authorIds) : { data: [] as { id: string; name: string }[] };
    const authorName = new Map((authors ?? []).map((a) => [a.id, a.name]));
    const reviews: MentorPopupReview[] = (reviewsR.data ?? []).map((r) => ({
      id: r.id,
      groupName: groupById.get(r.support_type_id)?.name ?? '-',
      rating: r.rating,
      memo: r.memo,
      authorName: authorName.get(r.author_id) ?? '-',
      createdAt: r.created_at,
    }));
    const ratings = reviews.map((r) => r.rating).filter((x): x is number => typeof x === 'number');
    const mentees: MentorPopupMentee[] = inScope.map((a) => {
      const c = caseById.get(a.case_id)!;
      const g = groupById.get(c.support_type_id);
      const score = scoreByCase.get(c.id);
      return {
        caseId: c.id,
        label: menteeLabel(c.owner_name, c.business_name),
        groupId: c.support_type_id,
        groupName: g?.name ?? null,
        statusLabel: c.status === 'withdrawn' ? '중도 종료' : (CASE_STATUS_META[c.status]?.short ?? c.status),
        withdrawn: c.status === 'withdrawn',
        roundsDone: rounds.get(c.id) ?? 0,
        requiredRounds: g?.required_rounds ?? 0,
        assignedAt: a.assigned_at,
        confirmedAt: a.confirmed_at,
        surveyScore: typeof score === 'number' ? score : null,
      };
    });
    const scores = mentees.map((m) => m.surveyScore).filter((s): s is number => typeof s === 'number');

    return {
      ok: true,
      data: {
        id: u.id,
        name: u.name,
        organization: u.organization,
        position: u.position,
        phone: u.phone,
        email: u.email,
        mentorInstitution: profR.data?.mentor_institution ?? null,
        expertise: (profR.data?.expertise ?? []).slice(0, 10),
        regions: profR.data?.regions ?? [],
        note: isOperator ? (profR.data?.note ?? null) : null,
        activeCount: mentees.filter((m) => !m.withdrawn).length,
        designatedGroups: (rosterR.data ?? []).filter((r) => groupIds.has(r.support_type_id)).map((r) => groupById.get(r.support_type_id)?.name ?? '-'),
        byGroup: Array.from(byGroupMap.entries()).map(([groupName, count]) => ({ groupName, count })),
        mentees,
        surveyAvg: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
        reviews,
        reviewAvg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      },
    };
  } catch (err) {
    console.error('getMentorPopupAction failed:', err);
    return { ok: false, error: `멘토 정보를 불러오지 못했습니다: ${err instanceof Error ? err.message : String(err)}` };
  }
}
