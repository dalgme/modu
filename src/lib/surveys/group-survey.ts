import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 라운드(사업그룹)별 만족도 설문 사용 여부 (2026-11-03, support_types.survey_enabled — 기본 사용).
 * 끈 라운드: 자동 개시·멘티 화면 노출·응답 제출·독려 문자·[만족도 생성]·그 라운드 대상 조사 개설이 모두 꺼진다.
 * 조회 실패·값 없음은 '사용'(기존 동작)으로 본다.
 */
export async function isGroupSurveyEnabled(supportTypeId: string | null | undefined): Promise<boolean> {
  if (!supportTypeId) return true;
  const { data, error } = await createAdminClient().from('support_types').select('survey_enabled').eq('id', supportTypeId).maybeSingle();
  if (error) {
    console.error('[group-survey] 조회 실패:', error.message);
    return true;
  }
  return data?.survey_enabled !== false;
}

/** 설문을 끈 라운드 id (행사 범위, programId 없으면 전체) */
export async function surveyDisabledGroupIds(programId?: string | null): Promise<Set<string>> {
  let q = createAdminClient().from('support_types').select('id').eq('survey_enabled', false);
  if (programId) q = q.eq('program_id', programId);
  const { data, error } = await q;
  if (error) {
    console.error('[group-survey] 조회 실패:', error.message);
    return new Set();
  }
  return new Set((data ?? []).map((g) => g.id));
}
