import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';

export type MentorChangeRequestRow = Tables<'mentor_change_requests'>;

/** 멘티 본인 케이스의 멘토 변경 요청 이력 (RLS: requested_by = auth.uid()) */
export async function listMentorChangeRequests(caseId: string): Promise<MentorChangeRequestRow[]> {
  const supabase = createClient();
  const { data } = await supabase.from('mentor_change_requests').select('*').eq('case_id', caseId).order('created_at', { ascending: false });
  return data ?? [];
}
