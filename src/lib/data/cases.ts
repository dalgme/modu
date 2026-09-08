import { createClient } from '@/lib/supabase/server';
import { menteeLoginKey } from '@/lib/auth/identifier';
import type { Tables } from '@/types/database';
import type { CaseStatus } from '@/types/case-status';

export type CaseRow = Tables<'cases'>;

/**
 * 케이스 목록/상세 행 — docs/MODU-DESIGN.md §3·§4.
 * 회차 수는 케이스 단위 누적(멘토가 바뀌어도 리셋되지 않는다 — CLAUDE.md §6-9).
 */
export interface CaseListItem extends CaseRow {
  supportTypeName: string | null;
  supportTypeCode: string | null;
  /** 그룹 회차 수 (승인된 추가 회차는 별도 합산) */
  requiredRounds: number;
  /** 등록된(이행) 회차 수 */
  roundsDone: number;
  /** 활성 배정 멘토 */
  mentorName: string | null;
  mentorId: string | null;
  mentorAssignedAt: string | null;
  /** 멘티 로그인 아이디 = 이름+휴대폰 뒷4자리. 계정 미발급이면 null */
  menteeLoginId: string | null;
}

function deriveMenteeLoginId(acc: { name: string | null; phone: string | null } | undefined): string | null {
  if (!acc) return null;
  return menteeLoginKey(acc.name, acc.phone);
}

export interface CaseFilters {
  /** 행사 범위 — 스태프 조회는 반드시 지정한다(컨텍스트). */
  programId?: string;
  supportTypeId?: string;
  status?: CaseStatus;
  mentorId?: string;
  menteeId?: string;
  from?: string;
  to?: string;
}

/**
 * 케이스 목록 조회. RLS 가 역할 범위를 한 번 더 막지만, 행사 범위는 코드에서 명시한다.
 * 임베디드 조인 대신 분리 조회 후 메모리 조인 (행사당 수백 건 규모).
 */
export async function listCases(filters: CaseFilters = {}): Promise<CaseListItem[]> {
  const supabase = createClient();

  let caseIdsByMentor: string[] | null = null;
  if (filters.mentorId) {
    const { data: assigns } = await supabase
      .from('mentor_assignments')
      .select('case_id')
      .eq('mentor_id', filters.mentorId)
      .eq('is_active', true);
    caseIdsByMentor = (assigns ?? []).map((a) => a.case_id);
    if (caseIdsByMentor.length === 0) return [];
  }

  let query = supabase.from('cases').select('*').order('created_at', { ascending: false });
  if (filters.programId) query = query.eq('program_id', filters.programId);
  if (filters.supportTypeId) query = query.eq('support_type_id', filters.supportTypeId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.menteeId) query = query.eq('mentee_id', filters.menteeId);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);
  if (caseIdsByMentor) query = query.in('id', caseIdsByMentor);

  const { data: cases, error } = await query;
  if (error || !cases || cases.length === 0) return [];

  const caseIds = cases.map((c) => c.id);
  const typeIds = Array.from(new Set(cases.map((c) => c.support_type_id)));
  const [{ data: types }, { data: assigns }, { data: logs }] = await Promise.all([
    supabase.from('support_types').select('id, name, code, required_rounds').in('id', typeIds),
    supabase
      .from('mentor_assignments')
      .select('case_id, mentor_id, assigned_at')
      .in('case_id', caseIds)
      .eq('is_active', true),
    supabase.from('mentoring_logs').select('case_id').in('case_id', caseIds),
  ]);
  const typeMap = new Map((types ?? []).map((t) => [t.id, t]));
  const roundsByCase = new Map<string, number>();
  for (const l of logs ?? []) roundsByCase.set(l.case_id, (roundsByCase.get(l.case_id) ?? 0) + 1);

  const mentorIds = Array.from(new Set((assigns ?? []).map((a) => a.mentor_id)));
  const menteeIds = Array.from(new Set(cases.map((c) => c.mentee_id).filter(Boolean))) as string[];
  const [{ data: mentors }, { data: mentees }] = await Promise.all([
    mentorIds.length
      ? supabase.from('users').select('id, name').in('id', mentorIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    menteeIds.length
      ? supabase.from('users').select('id, name, phone').in('id', menteeIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; phone: string | null }[] }),
  ]);
  const mentorNameById = new Map((mentors ?? []).map((m) => [m.id, m.name]));
  const assignByCase = new Map((assigns ?? []).map((a) => [a.case_id, a]));
  const menteeAccById = new Map((mentees ?? []).map((m) => [m.id, m]));

  return cases.map((c) => {
    const t = typeMap.get(c.support_type_id);
    const a = assignByCase.get(c.id);
    return {
      ...c,
      supportTypeName: t?.name ?? null,
      supportTypeCode: t?.code ?? null,
      requiredRounds: t?.required_rounds ?? 0,
      roundsDone: roundsByCase.get(c.id) ?? 0,
      mentorName: a ? (mentorNameById.get(a.mentor_id) ?? null) : null,
      mentorId: a?.mentor_id ?? null,
      mentorAssignedAt: a?.assigned_at ?? null,
      menteeLoginId: deriveMenteeLoginId(c.mentee_id ? menteeAccById.get(c.mentee_id) : undefined),
    };
  });
}

/** 멘토: 본인에게 배정된 케이스 (컨텍스트 행사/그룹 범위) */
export async function listMentorCases(
  mentorId: string,
  scope: { programId?: string; supportTypeId?: string } = {},
): Promise<CaseListItem[]> {
  return listCases({ mentorId, ...scope });
}

/** 멘티: 본인 케이스들 (그룹 승계로 여러 건일 수 있다). 최신순. */
export async function listMenteeCases(
  menteeId: string,
  scope: { programId?: string; supportTypeId?: string } = {},
): Promise<CaseListItem[]> {
  return listCases({ menteeId, ...scope });
}

/** 단일 케이스 상세. 접근 불가/없으면 null. */
export async function getCaseById(caseId: string): Promise<CaseListItem | null> {
  const supabase = createClient();
  const { data: c } = await supabase.from('cases').select('*').eq('id', caseId).maybeSingle();
  if (!c) return null;
  const [item] = await listCases({ programId: c.program_id, supportTypeId: c.support_type_id }).then((rows) =>
    rows.filter((r) => r.id === caseId),
  );
  return item ?? null;
}

/** 케이스 상태 이력 (타임라인용) */
export async function getCaseStatusHistory(caseId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from('case_status_history')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

/** 승계 체인: 이 케이스의 이전 단계 케이스들 (가장 가까운 것부터) */
export async function listPredecessorCases(caseId: string): Promise<CaseListItem[]> {
  const supabase = createClient();
  const out: CaseListItem[] = [];
  let cursor: string | null = caseId;
  for (let i = 0; i < 10 && cursor; i += 1) {
    const { data }: { data: { predecessor_case_id: string | null } | null } = await supabase
      .from('cases')
      .select('predecessor_case_id')
      .eq('id', cursor)
      .maybeSingle();
    const prevId: string | null = data?.predecessor_case_id ?? null;
    if (!prevId) break;
    const prev = await getCaseById(prevId);
    if (!prev) break;
    out.push(prev);
    cursor = prevId;
  }
  return out;
}

/** 멘티 본인 케이스 중 최신 1건 (문의 작성 등 단일 케이스가 필요한 곳) */
export async function getMenteeCase(
  menteeId: string,
  scope: { programId?: string; supportTypeId?: string } = {},
): Promise<CaseListItem | null> {
  const rows = await listMenteeCases(menteeId, scope);
  return rows[0] ?? null;
}

/** 행사에 소속된 활성 멘토 목록 (배정 후보). 그룹을 주면 그룹 명부 멘토를 앞에 둔다. */
export async function listMentorsForProgram(
  programId: string,
  supportTypeId?: string | null,
): Promise<{ id: string; name: string; inGroup: boolean }[]> {
  const supabase = createClient();
  // 이 행사에서 역할이 멘토인 소속(설계 B: program_members.role)
  const { data: members } = await supabase
    .from('program_members')
    .select('user_id')
    .eq('program_id', programId)
    .eq('role', 'mentor')
    .eq('is_active', true);
  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const [{ data: users }, { data: roster }] = await Promise.all([
    supabase.from('users').select('id, name').in('id', ids).eq('is_active', true).order('name'),
    supportTypeId
      ? supabase.from('support_type_members').select('user_id').eq('support_type_id', supportTypeId).eq('is_active', true)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);
  const inGroup = new Set((roster ?? []).map((r) => r.user_id));
  return (users ?? [])
    .map((u) => ({ id: u.id, name: u.name, inGroup: inGroup.has(u.id) }))
    .sort((a, b) => Number(b.inGroup) - Number(a.inGroup) || a.name.localeCompare(b.name, 'ko'));
}
