import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listMenteeCases, type CaseListItem } from '@/lib/data/cases';
import { surveyOpenFor } from '@/lib/workflow/mentee';
import type { Tables } from '@/types/database';

export type MentorChangeRequestRow = Tables<'mentor_change_requests'>;

/** 멘티 본인 케이스의 멘토 변경 요청 이력 (RLS: requested_by = auth.uid()) */
export async function listMentorChangeRequests(caseId: string): Promise<MentorChangeRequestRow[]> {
  const supabase = createClient();
  const { data } = await supabase.from('mentor_change_requests').select('*').eq('case_id', caseId).order('created_at', { ascending: false });
  return data ?? [];
}

export interface MenteeCasePick {
  /** 선택된 케이스 (없으면 null) */
  current: CaseListItem | null;
  /** 행사 안 본인 케이스 전체(최신순) — 2건 이상이면 화면이 `?case=` 선택 UI 를 그린다 */
  cases: CaseListItem[];
  /** 케이스별 할 일 표시 (서명 대기 회차 수 · 만족도 열림) */
  pending: Record<string, { unsigned: number; surveyOpen: boolean }>;
}

/**
 * 멘티 회차·만족도 화면의 케이스 선택 (P30) — 승계로 한 행사에 케이스가 여러 건일 수 있다.
 * 우선순위: `?case=` 로 지정한 본인 케이스 → 할 일(미서명 회차·열린 만족도)이 있는 케이스 → 최신 케이스.
 * 케이스 목록은 RLS(멘티 본인) 로 읽고, 할 일 집계만 service_role 로 읽는다(본인 케이스 id 로 한정).
 */
export async function pickMenteeCase(menteeId: string, scope: { programId: string; supportTypeId?: string | null }, requestedCaseId?: string | null): Promise<MenteeCasePick> {
  const all = await listMenteeCases(menteeId, { programId: scope.programId });
  // 그룹 컨텍스트가 있으면 그 그룹 케이스를 앞으로 (기본 선택 우선), 나머지는 이력
  const cases = scope.supportTypeId ? [...all.filter((c) => c.support_type_id === scope.supportTypeId), ...all.filter((c) => c.support_type_id !== scope.supportTypeId)] : all;
  const pending: MenteeCasePick['pending'] = {};
  if (cases.length > 0) {
    const admin = createAdminClient();
    const ids = cases.map((c) => c.id);
    const [{ data: logs }, { data: responses }] = await Promise.all([
      admin.from('mentoring_logs').select('case_id').in('case_id', ids).not('report_registered_at', 'is', null).is('mentee_signed_at', null),
      admin.from('survey_responses').select('case_id').in('case_id', ids),
    ]);
    const answered = new Set((responses ?? []).map((r) => r.case_id));
    for (const c of cases) pending[c.id] = { unsigned: 0, surveyOpen: !answered.has(c.id) && surveyOpenFor(c) };
    for (const l of logs ?? []) if (pending[l.case_id]) pending[l.case_id]!.unsigned += 1;
  }
  const requested = requestedCaseId ? cases.find((c) => c.id === requestedCaseId) : undefined;
  const withWork = cases.find((c) => (pending[c.id]?.unsigned ?? 0) > 0 || pending[c.id]?.surveyOpen);
  return { current: requested ?? withWork ?? cases[0] ?? null, cases, pending };
}
