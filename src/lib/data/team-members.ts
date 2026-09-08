import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';

export type TeamMemberRow = Tables<'case_team_members'>;

/**
 * 케이스의 팀원 명단 (대표 우선, 등록순). RLS(can_access_case)로 접근 제어 —
 * 운영사·발주처·담당 멘토·멘티 본인이 읽는다. 쓰기는 운영사 서버 액션(service_role)만.
 */
export async function listTeamMembers(caseId: string): Promise<TeamMemberRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('case_team_members')
    .select('*')
    .eq('case_id', caseId)
    .order('is_representative', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return data ?? [];
}
