import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 매칭 규칙 (P25-04): 라운드(사업그룹)별 멘토 1인당 최대 멘티 수.
 * 설정값은 support_types.max_mentees_per_mentor (기본 2) — 배정·재배정·자동 매칭이 전부 이 게이트를 읽는다.
 */

export const DEFAULT_MAX_MENTEES_PER_MENTOR = 2;

/** 그룹별 정원 맵 (행사 전체) */
export async function loadGroupCapacities(programId: string): Promise<Map<string, number>> {
  const { data } = await createAdminClient().from('support_types').select('id, max_mentees_per_mentor').eq('program_id', programId);
  return new Map((data ?? []).map((g) => [g.id, g.max_mentees_per_mentor ?? DEFAULT_MAX_MENTEES_PER_MENTOR]));
}

/** 이 그룹에서 멘토의 현재 활성 배정 수 */
export async function countMentorActiveInGroup(mentorId: string, supportTypeId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from('mentor_assignments')
    .select('id, cases!inner(support_type_id)', { count: 'exact', head: true })
    .eq('mentor_id', mentorId)
    .eq('is_active', true)
    .eq('cases.support_type_id', supportTypeId);
  return count ?? 0;
}

/** 정원 게이트 — 초과면 안내 문구, 아니면 null */
export async function assertMentorCapacity(mentorId: string, supportTypeId: string): Promise<string | null> {
  const admin = createAdminClient();
  const [{ data: g }, current] = await Promise.all([
    admin.from('support_types').select('name, max_mentees_per_mentor').eq('id', supportTypeId).maybeSingle(),
    countMentorActiveInGroup(mentorId, supportTypeId),
  ]);
  const max = g?.max_mentees_per_mentor ?? DEFAULT_MAX_MENTEES_PER_MENTOR;
  if (current >= max) {
    return `이 라운드(${g?.name ?? '그룹'})에서 멘토 1인당 최대 ${max}명까지 배정할 수 있습니다. (현재 ${current}명) — 운영 설정 [매칭 규칙]에서 조정할 수 있습니다.`;
  }
  return null;
}
