import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/lib/auth/roles';

/** 멘티·멘토 리스트의 임의 컬럼(카테고리 마크) 정의 */
export interface RosterColumn {
  id: string;
  target: UserRole;
  name: string;
  sortOrder: number;
}

export interface RosterColumnsData {
  columns: RosterColumn[];
  /** `${columnId}:${userId}` → 값 */
  values: Record<string, string>;
}

/**
 * 이 행사의 임의 컬럼 정의 + 회원별 값 (운영사 전용 — 호출부에서 requireNextlab + requireContext).
 * 값 키는 `${columnId}:${userId}` 로 평탄화해 클라이언트에 그대로 넘긴다.
 */
export async function listRosterColumns(programId: string): Promise<RosterColumnsData> {
  const admin = createAdminClient();
  const { data: columns } = await admin
    .from('roster_columns')
    .select('id, target, name, sort_order')
    .eq('program_id', programId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  const ids = (columns ?? []).map((c) => c.id);
  const { data: values } = ids.length
    ? await admin.from('roster_values').select('column_id, user_id, value').in('column_id', ids)
    : { data: [] as { column_id: string; user_id: string; value: string }[] };
  const map: Record<string, string> = {};
  for (const v of values ?? []) {
    if (v.value) map[`${v.column_id}:${v.user_id}`] = v.value;
  }
  return {
    columns: (columns ?? []).map((c) => ({ id: c.id, target: c.target as UserRole, name: c.name, sortOrder: c.sort_order })),
    values: map,
  };
}
