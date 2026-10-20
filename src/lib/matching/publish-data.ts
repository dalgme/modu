import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { isMatchingPublished } from '@/lib/matching/visibility-shared';

/** 운영 설정 › 매칭 공개 — 라운드(그룹)별 현황 (P54) */
export interface MatchingPublishGroup {
  id: string;
  code: string;
  name: string;
  /** 종료된 그룹 (ends_on 지남) */
  ended: boolean;
  published: boolean;
  publishedAt: string | null;
  /** 등록 멘티 (중도 종료 제외) */
  mentees: number;
  /** 활성 배정이 있는 멘티 */
  matched: number;
  /** 배정 대기 (멘티 등록·재배정 대기) */
  unmatched: number;
  /** 배정된 멘토 수 (중복 제외) */
  mentors: number;
  /** 로그인 안내 문자를 아직 받지 않은 배정 멘토 수 */
  mentorsWithoutNotice: number;
  /** 회차가 등록된 케이스 수 — 다시 감추기 경고용 */
  casesWithRounds: number;
}

export async function loadMatchingPublishOverview(programId: string): Promise<MatchingPublishGroup[]> {
  const admin = createAdminClient();
  const { data: groups } = await admin.from('support_types').select('*').eq('program_id', programId).order('code');
  const cases = await fetchAll<{ id: string; support_type_id: string; status: string }>((from, to) =>
    admin.from('cases').select('id, support_type_id, status').eq('program_id', programId).neq('status', 'withdrawn').range(from, to),
  );
  const caseIds = cases.map((c) => c.id);
  const [assigns, logs] = await Promise.all([
    fetchAllIn<{ case_id: string; mentor_id: string; notice_sent_at: string | null }>(caseIds, (chunk, from, to) =>
      admin.from('mentor_assignments').select('case_id, mentor_id, notice_sent_at').eq('is_active', true).in('case_id', chunk).range(from, to),
    ),
    fetchAllIn<{ case_id: string }>(caseIds, (chunk, from, to) => admin.from('mentoring_logs').select('case_id').in('case_id', chunk).range(from, to)),
  ]);
  const groupOfCase = new Map(cases.map((c) => [c.id, c.support_type_id]));
  const roundCases = new Set(logs.map((l) => l.case_id));
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  return (groups ?? []).map((g) => {
    const mine = cases.filter((c) => c.support_type_id === g.id);
    const myAssigns = assigns.filter((a) => groupOfCase.get(a.case_id) === g.id);
    const mentors = new Set(myAssigns.map((a) => a.mentor_id));
    const noNotice = new Set(myAssigns.filter((a) => !a.notice_sent_at).map((a) => a.mentor_id));
    return {
      id: g.id,
      code: g.code,
      name: g.name,
      ended: !!g.ends_on && g.ends_on < today,
      published: isMatchingPublished(g),
      publishedAt: (g as { matching_published_at?: string | null }).matching_published_at ?? null,
      mentees: mine.length,
      matched: new Set(myAssigns.map((a) => a.case_id)).size,
      unmatched: mine.filter((c) => c.status === 'registered' || c.status === 'reassignment_pending').length,
      mentors: mentors.size,
      mentorsWithoutNotice: noNotice.size,
      casesWithRounds: mine.filter((c) => roundCases.has(c.id)).length,
    };
  });
}
