import 'server-only';

import { cache } from 'react';

import { createAdminClient } from '@/lib/supabase/admin';
import { isMatchingPublished } from '@/lib/matching/visibility-shared';

/**
 * 행사의 감추기(매칭정보 비공개) 그룹 id 집합 (P54). 요청당 1회만 읽는다.
 * `select('*')` — 컬럼이 없는 DB 에서도 오류 없이 "전부 공개"로 동작한다.
 */
export const hiddenMatchingGroupIds = cache(async (programId: string): Promise<Set<string>> => {
  const { data, error } = await createAdminClient().from('support_types').select('*').eq('program_id', programId);
  if (error) {
    console.error('hiddenMatchingGroupIds failed:', error.message);
    return new Set();
  }
  return new Set((data ?? []).filter((g) => !isMatchingPublished(g)).map((g) => g.id));
});

/** 그룹 하나의 공개 여부 (그룹 id 를 모르면 공개로 본다) */
export const isGroupMatchingPublished = cache(async (supportTypeId: string | null | undefined): Promise<boolean> => {
  if (!supportTypeId) return true;
  const { data, error } = await createAdminClient().from('support_types').select('*').eq('id', supportTypeId).maybeSingle();
  if (error) console.error('isGroupMatchingPublished failed:', error.message);
  return isMatchingPublished(data);
});

/** 케이스 하나가 감추기 그룹 소속인가 */
export async function isCaseMatchingHidden(caseId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('cases').select('support_type_id').eq('id', caseId).maybeSingle();
  if (!data) return false;
  return !(await isGroupMatchingPublished(data.support_type_id));
}
