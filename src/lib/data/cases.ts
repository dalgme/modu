import { fetchAllIn } from '@/lib/supabase/paginate';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
  /** 이행 회차 수 = 보고서(2단계)까지 등록된 회차 (CLAUDE.md §3-1) */
  roundsDone: number;
  /** 등록된 회차 전체(계획 포함) */
  roundsPlanned: number;
  /** 담당 멘토 — 활성 배정. 종결·중도 종료 케이스는 마지막 배정(mentorEnded=true) */
  mentorName: string | null;
  mentorId: string | null;
  mentorAssignedAt: string | null;
  /** true 면 mentorId 는 종료된(마지막) 배정 — 정원·활성 계산에 넣지 말 것 (P30) */
  mentorEnded: boolean;
  /** 멘티 로그인 아이디 = 이름+휴대폰 뒷4자리. 계정 미발급이면 null */
  menteeLoginId: string | null;
  /** 담당 멘토의 현재 확정 배정 멘티 수 — 조회 범위(행사/그룹) 기준 (P25-10 "이름(n)") */
  mentorActiveCount: number;
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
  /** mentorId 필터에서 종결·중도 종료된(비활성) 배정 케이스도 포함 (멘토 '완료 멘티', P30) */
  includeEnded?: boolean;
  /** 여러 상태 (status 와 함께 쓰면 status 우선) */
  statuses?: CaseStatus[];
  /**
   * service_role 로 읽는다 — RLS 범위 밖 케이스(멘토의 이전 단계 케이스, 승계 조회 등)를 코드 필터로만 좁혀 읽을 때.
   * 호출부가 반드시 programId(+접근 근거)를 확인한다 (CLAUDE.md §6-2).
   */
  admin?: boolean;
}

/**
 * 케이스 목록 조회. RLS 가 역할 범위를 한 번 더 막지만, 행사 범위는 코드에서 명시한다.
 * 임베디드 조인 대신 분리 조회 후 메모리 조인 (행사당 수백 건 규모).
 */
export async function listCases(filters: CaseFilters = {}): Promise<CaseListItem[]> {
  const supabase = filters.admin ? createAdminClient() : createClient();

  let caseIdsByMentor: string[] | null = null;
  if (filters.mentorId) {
    let aq = supabase.from('mentor_assignments').select('case_id, is_active, end_kind').eq('mentor_id', filters.mentorId);
    aq = filters.includeEnded ? aq.or('is_active.eq.true,end_kind.in.(case_closed,case_withdrawn)') : aq.eq('is_active', true);
    const { data: assigns } = await aq;
    caseIdsByMentor = Array.from(new Set((assigns ?? []).map((a) => a.case_id)));
    if (caseIdsByMentor.length === 0) return [];
  }

  let query = supabase.from('cases').select('*').order('created_at', { ascending: false });
  if (filters.programId) query = query.eq('program_id', filters.programId);
  if (filters.supportTypeId) query = query.eq('support_type_id', filters.supportTypeId);
  if (filters.status) query = query.eq('status', filters.status);
  else if (filters.statuses && filters.statuses.length > 0) query = query.in('status', filters.statuses);
  if (filters.menteeId) query = query.eq('mentee_id', filters.menteeId);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);
  if (caseIdsByMentor) query = query.in('id', caseIdsByMentor);

  const { data: cases, error } = await query;
  if (error || !cases || cases.length === 0) return [];

  const caseIds = cases.map((c) => c.id);
  const typeIds = Array.from(new Set(cases.map((c) => c.support_type_id)));
  // 회차·배정은 1,000행 캡을 넘을 수 있어 페이지로 읽는다 (P30)
  const [{ data: types }, assigns, logs] = await Promise.all([
    supabase.from('support_types').select('id, name, code, required_rounds').in('id', typeIds),
    fetchAllIn<{ case_id: string; mentor_id: string; assigned_at: string; is_active: boolean; end_kind: string | null }>(caseIds, (chunk, from, to) =>
      supabase.from('mentor_assignments').select('case_id, mentor_id, assigned_at, is_active, end_kind').in('case_id', chunk).order('assigned_at', { ascending: false }).range(from, to),
    ),
    fetchAllIn<{ case_id: string; report_registered_at: string | null }>(caseIds, (chunk, from, to) => supabase.from('mentoring_logs').select('case_id, report_registered_at').in('case_id', chunk).range(from, to)),
  ]);
  const typeMap = new Map((types ?? []).map((t) => [t.id, t]));
  const roundsByCase = new Map<string, number>();
  const plannedByCase = new Map<string, number>();
  for (const l of logs ?? []) {
    plannedByCase.set(l.case_id, (plannedByCase.get(l.case_id) ?? 0) + 1);
    if (l.report_registered_at) roundsByCase.set(l.case_id, (roundsByCase.get(l.case_id) ?? 0) + 1);
  }

  // 케이스별 담당 배정: 활성 배정 우선, 없으면(종결·중도 종료) 가장 최근 배정 — 종결 후에도 멘토가 명단·리포트에 남는다 (P30)
  const assignByCase = new Map<string, { case_id: string; mentor_id: string; assigned_at: string; ended: boolean }>();
  for (const a of assigns) {
    if (a.is_active) assignByCase.set(a.case_id, { case_id: a.case_id, mentor_id: a.mentor_id, assigned_at: a.assigned_at, ended: false });
  }
  for (const a of assigns) {
    if (!assignByCase.has(a.case_id) && (a.end_kind === 'case_closed' || a.end_kind === 'case_withdrawn')) {
      assignByCase.set(a.case_id, { case_id: a.case_id, mentor_id: a.mentor_id, assigned_at: a.assigned_at, ended: true });
    }
  }
  const mentorIds = Array.from(new Set(Array.from(assignByCase.values()).map((a) => a.mentor_id)));
  const menteeIds = Array.from(new Set(cases.map((c) => c.mentee_id).filter(Boolean))) as string[];
  // 회원 id 는 수백 개가 될 수 있어 `in()` 을 200개 단위로 쪼개 읽는다 (P31, paginate.ts)
  const [mentors, mentees] = await Promise.all([
    fetchAllIn<{ id: string; name: string }>(mentorIds, (chunk, from, to) => supabase.from('users').select('id, name').in('id', chunk).range(from, to)),
    fetchAllIn<{ id: string; name: string | null; phone: string | null }>(menteeIds, (chunk, from, to) => supabase.from('users').select('id, name, phone').in('id', chunk).range(from, to)),
  ]);
  const mentorNameById = new Map(mentors.map((m) => [m.id, m.name]));
  const menteeAccById = new Map(mentees.map((m) => [m.id, m]));
  // 멘토별 확정 배정 수 — 조회 범위(행사, 그룹이 있으면 그룹) 기준. 필터로 잘린 목록이 아니라 범위 전체를 센다.
  const mentorActive = new Map<string, number>();
  if (mentorIds.length) {
    const allActive = await fetchAllIn<{ mentor_id: string }>(mentorIds, (chunk, from, to) => {
      let q = supabase.from('mentor_assignments').select('mentor_id, cases!inner(program_id, support_type_id)').eq('is_active', true).in('mentor_id', chunk);
      if (filters.programId) q = q.eq('cases.program_id', filters.programId);
      if (filters.supportTypeId) q = q.eq('cases.support_type_id', filters.supportTypeId);
      return q.range(from, to);
    });
    for (const a of allActive) mentorActive.set(a.mentor_id, (mentorActive.get(a.mentor_id) ?? 0) + 1);
  }

  return cases.map((c) => {
    const t = typeMap.get(c.support_type_id);
    const a = assignByCase.get(c.id);
    return {
      ...c,
      supportTypeName: t?.name ?? null,
      supportTypeCode: t?.code ?? null,
      requiredRounds: t?.required_rounds ?? 0,
      roundsDone: roundsByCase.get(c.id) ?? 0,
      roundsPlanned: plannedByCase.get(c.id) ?? 0,
      mentorName: a ? (mentorNameById.get(a.mentor_id) ?? null) : null,
      mentorId: a?.mentor_id ?? null,
      mentorAssignedAt: a?.assigned_at ?? null,
      mentorEnded: !!a?.ended,
      menteeLoginId: deriveMenteeLoginId(c.mentee_id ? menteeAccById.get(c.mentee_id) : undefined),
      mentorActiveCount: a ? (mentorActive.get(a.mentor_id) ?? 0) : 0,
    };
  });
}

/** 멘토: 본인에게 배정된 케이스 (컨텍스트 행사/그룹 범위) */
export async function listMentorCases(
  mentorId: string,
  scope: { programId?: string; supportTypeId?: string; includeEnded?: boolean } = {},
): Promise<CaseListItem[]> {
  return listCases({ mentorId, ...scope });
}

/**
 * 멘토: 종결·중도 종료로 끝난 담당 케이스 (읽기 전용 목록, P30).
 * RLS(is_mentor_of)는 활성 배정만 통과시키므로 service_role 로 읽되, 본인 배정 이력이 있는 케이스만 돌려준다.
 */
export async function listMentorEndedCases(mentorId: string, programId: string): Promise<CaseListItem[]> {
  const admin = createAdminClient();
  const { data: assigns } = await admin
    .from('mentor_assignments')
    .select('case_id, assigned_at, cases!inner(program_id)')
    .eq('mentor_id', mentorId)
    .eq('is_active', false)
    .in('end_kind', ['case_closed', 'case_withdrawn'])
    .eq('cases.program_id', programId)
    .order('assigned_at', { ascending: false });
  const ids = Array.from(new Set((assigns ?? []).map((a) => a.case_id)));
  if (ids.length === 0) return [];
  const [{ data: cases }, logs] = await Promise.all([
    admin.from('cases').select('*, support_types(name, code, required_rounds)').in('id', ids).in('status', ['closed', 'withdrawn']).order('closed_at', { ascending: false }),
    fetchAllIn<{ case_id: string; report_registered_at: string | null }>(ids, (chunk, from, to) => admin.from('mentoring_logs').select('case_id, report_registered_at').in('case_id', chunk).range(from, to)),
  ]);
  const done = new Map<string, number>();
  const planned = new Map<string, number>();
  for (const l of logs) {
    planned.set(l.case_id, (planned.get(l.case_id) ?? 0) + 1);
    if (l.report_registered_at) done.set(l.case_id, (done.get(l.case_id) ?? 0) + 1);
  }
  const assignedAt = new Map((assigns ?? []).map((a) => [a.case_id, a.assigned_at]));
  return (cases ?? []).map((row) => {
    const { support_types, ...c } = row as typeof row & { support_types: { name: string; code: string; required_rounds: number } | null };
    return {
      ...(c as CaseRow),
      supportTypeName: support_types?.name ?? null,
      supportTypeCode: support_types?.code ?? null,
      requiredRounds: support_types?.required_rounds ?? 0,
      roundsDone: done.get(c.id) ?? 0,
      roundsPlanned: planned.get(c.id) ?? 0,
      mentorName: null,
      mentorId,
      mentorAssignedAt: assignedAt.get(c.id) ?? null,
      mentorEnded: true,
      menteeLoginId: null,
      mentorActiveCount: 0,
    };
  });
}

/** 멘티: 본인 케이스들 (그룹 승계로 여러 건일 수 있다). 최신순. */
export async function listMenteeCases(
  menteeId: string,
  scope: { programId?: string; supportTypeId?: string } = {},
): Promise<CaseListItem[]> {
  return listCases({ menteeId, ...scope });
}

/** 단일 케이스 상세. 접근 불가/없으면 null. admin 이면 RLS 밖(service_role) — 호출부가 접근 근거를 확인한다. */
export async function getCaseById(caseId: string, opts: { admin?: boolean } = {}): Promise<CaseListItem | null> {
  const supabase = opts.admin ? createAdminClient() : createClient();
  const { data: c } = await supabase.from('cases').select('*').eq('id', caseId).maybeSingle();
  if (!c) return null;
  const [item] = await listCases({ programId: c.program_id, supportTypeId: c.support_type_id, admin: opts.admin }).then((rows) =>
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

/**
 * 승계 체인: 이 케이스의 이전 단계 케이스들 (가장 가까운 것부터).
 * admin 이면 service_role — 멘토는 이전 단계 케이스(다른 배정)를 RLS 로 못 읽으므로 화면이 요약만 보여줄 때 쓴다 (P30).
 */
export async function listPredecessorCases(caseId: string, opts: { admin?: boolean } = {}): Promise<CaseListItem[]> {
  const supabase = opts.admin ? createAdminClient() : createClient();
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
    const prev = await getCaseById(prevId, { admin: opts.admin });
    if (!prev) break;
    out.push(prev);
    cursor = prevId;
  }
  return out;
}

/** 승계 다음 단계: predecessor_case_id = 이 케이스인 케이스들 (service_role, 스태프 화면 전용 — P30) */
export async function listSuccessorCases(caseId: string): Promise<CaseListItem[]> {
  const admin = createAdminClient();
  const { data: rows } = await admin.from('cases').select('id, program_id').eq('predecessor_case_id', caseId).order('created_at');
  const out: CaseListItem[] = [];
  for (const r of rows ?? []) {
    const item = await getCaseById(r.id, { admin: true });
    if (item) out.push(item);
  }
  return out;
}

/** 여러 케이스의 승계 케이스 맵 (원천 케이스 id → 승계 케이스 요약) — 승계 개설 화면의 "승계됨" 배지 */
export async function mapSuccessors(sourceCaseIds: string[]): Promise<Map<string, { caseId: string; supportTypeId: string; supportTypeName: string | null; status: CaseStatus }>> {
  const admin = createAdminClient();
  const rows = await fetchAllIn<{ id: string; predecessor_case_id: string | null; support_type_id: string; status: CaseStatus }>(sourceCaseIds, (chunk, from, to) =>
    admin.from('cases').select('id, predecessor_case_id, support_type_id, status').in('predecessor_case_id', chunk).range(from, to),
  );
  const typeIds = Array.from(new Set(rows.map((r) => r.support_type_id)));
  const { data: types } = typeIds.length ? await admin.from('support_types').select('id, name').in('id', typeIds) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((types ?? []).map((t) => [t.id, t.name]));
  const out = new Map<string, { caseId: string; supportTypeId: string; supportTypeName: string | null; status: CaseStatus }>();
  for (const r of rows) {
    if (!r.predecessor_case_id) continue;
    // 중도 종료된 승계 케이스는 "승계됨"으로 치지 않는다(재승계 가능)
    if (r.status === 'withdrawn' && out.has(r.predecessor_case_id)) continue;
    const prev = out.get(r.predecessor_case_id);
    if (prev && prev.status !== 'withdrawn') continue;
    out.set(r.predecessor_case_id, { caseId: r.id, supportTypeId: r.support_type_id, supportTypeName: nameOf.get(r.support_type_id) ?? null, status: r.status });
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
      ? supabase.from('support_type_members').select('user_id').eq('support_type_id', supportTypeId).eq('member_role', 'mentor').eq('is_active', true)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);
  const inGroup = new Set((roster ?? []).map((r) => r.user_id));
  return (users ?? [])
    .map((u) => ({ id: u.id, name: u.name, inGroup: inGroup.has(u.id) }))
    .sort((a, b) => Number(b.inGroup) - Number(a.inGroup) || a.name.localeCompare(b.name, 'ko'));
}
