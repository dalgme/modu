import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 그룹별 관찰의견서 제출 필요 여부 (2026-10-15, 0091 `support_types.observation_required`).
 * false 인 그룹(예: 1기 2라운드)은 회차 보고서만으로 종결 요청·검수 승인이 가능하고 멘토 화면에 관찰의견서 제출란이 없다.
 * 종결 준비 판정(checkClosureReadiness)·종결 요청(requestClosure)·검수 승인(canApproveClosure)·검수 대기열·멘토 입력 대기·
 * 대시보드·멘토 화면이 전부 이 함수를 읽는다(버튼 조건 = 서버 게이트).
 * 컬럼이 아직 없는 DB 에서도 깨지지 않도록 `select('*')` 로 읽고, 값이 없으면 기존 동작(필요)으로 본다.
 */
export async function observationRequiredMap(supportTypeIds: (string | null | undefined)[]): Promise<Map<string, boolean>> {
  const ids = Array.from(new Set(supportTypeIds.filter((x): x is string => !!x)));
  const map = new Map<string, boolean>();
  if (ids.length === 0) return map;
  const { data, error } = await createAdminClient().from('support_types').select('*').in('id', ids);
  if (error) console.error('[observation-required] 그룹 조회 실패', error.message);
  for (const row of (data ?? []) as { id: string; observation_required?: boolean | null }[]) map.set(row.id, row.observation_required !== false);
  return map;
}

export async function observationRequiredFor(supportTypeId: string | null | undefined): Promise<boolean> {
  if (!supportTypeId) return true;
  return (await observationRequiredMap([supportTypeId])).get(supportTypeId) ?? true;
}
