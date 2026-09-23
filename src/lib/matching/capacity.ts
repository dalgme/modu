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

/**
 * 그룹 지정 게이트 (P25 규칙 · P28 서버 강제) — 활성 지정이 하나라도 있으면 지정 그룹에서만 배정할 수 있다. 위반이면 안내 문구, 아니면 null.
 */
export async function assertMentorEligible(mentorId: string, supportTypeId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: g } = await admin.from('support_types').select('program_id, name').eq('id', supportTypeId).maybeSingle();
  if (!g) return '그룹을 찾을 수 없습니다.';
  const { data: rows } = await admin
    .from('support_type_members')
    .select('support_type_id, support_types!inner(program_id)')
    .eq('user_id', mentorId)
    .eq('member_role', 'mentor')
    .eq('is_active', true)
    .eq('support_types.program_id', g.program_id);
  const designated = (rows ?? []).map((r) => r.support_type_id);
  if (designated.length > 0 && !designated.includes(supportTypeId)) {
    return `이 멘토는 다른 그룹에만 지정되어 있어 ${g.name} 에 배정할 수 없습니다. (회원 명단 › 멘토 계정 관리 › 정보 수정에서 그룹 지정을 바꾸세요)`;
  }
  return null;
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
