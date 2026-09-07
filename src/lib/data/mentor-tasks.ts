import { createClient } from '@/lib/supabase/server';
import { listMentorCases, type CaseListItem } from '@/lib/data/cases';

export interface MentorCaseWithLogs {
  case: CaseListItem;
  logCount: number;
}

/**
 * 멘토 담당 케이스 + 케이스별 멘토링 일지 작성 횟수.
 * '멘티별 업무진행'에서 유형별 필수 회차 대비 진행 상황을 계산하는 데 사용한다.
 */
export async function listMentorCasesWithLogs(mentorId: string): Promise<MentorCaseWithLogs[]> {
  const cases = await listMentorCases(mentorId);
  if (cases.length === 0) return [];

  const supabase = createClient();
  const ids = cases.map((c) => c.id);
  const { data: logs } = await supabase
    .from('mentoring_logs')
    .select('case_id')
    .in('case_id', ids);

  const counts = new Map<string, number>();
  for (const l of logs ?? []) counts.set(l.case_id, (counts.get(l.case_id) ?? 0) + 1);

  return cases.map((c) => ({ case: c, logCount: counts.get(c.id) ?? 0 }));
}
