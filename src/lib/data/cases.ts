import { createClient } from '@/lib/supabase/server';
import { menteeLoginKey } from '@/lib/auth/identifier';
import type { Tables } from '@/types/database';
import type { CaseStatus } from '@/types/case-status';

export type CaseRow = Tables<'cases'>;
export type SupportType = Tables<'support_types'>;

export interface CaseListItem extends CaseRow {
  supportTypeName: string | null;
  supportTypeCode: string | null;
  mentorName: string | null;
  /** 현재 활성 배정 멘토 id (재배정 시 후보 제외용). 미배정이면 null */
  mentorId: string | null;
  /** 현재 활성 배정의 멘토 배정일시(ISO). 미배정이면 null. 배정 후 경과일 표시용 */
  mentorAssignedAt: string | null;
  /** 붙임서식 중 재생성(2회 이상 생성)된 서식 수 */
  regeneratedFormCount: number;
  /** 등록 시 첨부된 사업신청서 원본 PDF 존재 여부 */
  hasApplicationPdf: boolean;
  /** 업체별 사업추진 계획서 첨부 존재 여부 */
  hasBusinessPlan: boolean;
  /** 멘티 로그인 아이디 = 이름+휴대폰 뒷4자리. 계정 미발급이면 null */
  menteeLoginId: string | null;
}

/** 멘티 계정의 로그인 아이디 도출 (이름+휴대폰 뒷4자리). 계정 없으면 null. */
function deriveMenteeLoginId(acc: { name: string | null; phone: string | null } | undefined): string | null {
  if (!acc) return null;
  return menteeLoginKey(acc.name, acc.phone);
}

export interface CaseFilters {
  supportTypeId?: string;
  status?: CaseStatus;
  mentorId?: string;
  from?: string;
  to?: string;
}

/**
 * 케이스 목록 조회 (RLS 로 역할별 범위 자동 제한).
 * 진흥원/넥스트랩은 전체, 멘토는 배정 케이스, 멘티는 본인만 반환된다.
 * 임베디드 조인 대신 분리 조회 후 메모리 조인 (연 30~100건, 소규모).
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
  if (filters.supportTypeId) query = query.eq('support_type_id', filters.supportTypeId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);
  if (caseIdsByMentor) query = query.in('id', caseIdsByMentor);

  const { data: cases, error } = await query;
  if (error || !cases) return [];
  if (cases.length === 0) return [];

  // 지원유형명 · 활성 배정 멘토 (서로 독립 → 병렬)
  const caseIds = cases.map((c) => c.id);
  const [{ data: types }, { data: assigns }, { data: formDocs }] = await Promise.all([
    supabase.from('support_types').select('id, name, code'),
    supabase
      .from('mentor_assignments')
      .select('case_id, mentor_id, assigned_at')
      .in('case_id', caseIds)
      .eq('is_active', true),
    supabase.from('documents').select('case_id, doc_key').in('case_id', caseIds),
  ]);
  const typeMap = new Map((types ?? []).map((t) => [t.id, t]));

  // 케이스별 재생성(2회 이상 생성) 서식 수 집계 + 신청서 PDF 첨부 여부
  const formCountByCaseKey = new Map<string, number>();
  const appPdfCaseIds = new Set<string>();
  const businessPlanCaseIds = new Set<string>();
  for (const d of formDocs ?? []) {
    if (!d.doc_key) continue;
    if (d.doc_key === 'application_pdf') {
      appPdfCaseIds.add(d.case_id);
      continue;
    }
    if (d.doc_key === 'business_plan_attachment') {
      businessPlanCaseIds.add(d.case_id);
      continue;
    }
    if (!d.doc_key.startsWith('form_')) continue;
    const k = `${d.case_id}::${d.doc_key}`;
    formCountByCaseKey.set(k, (formCountByCaseKey.get(k) ?? 0) + 1);
  }
  const regeneratedByCase = new Map<string, number>();
  for (const [k, n] of Array.from(formCountByCaseKey.entries())) {
    if (n > 1) {
      const caseId = k.split('::')[0]!;
      regeneratedByCase.set(caseId, (regeneratedByCase.get(caseId) ?? 0) + 1);
    }
  }

  const mentorIds = Array.from(new Set((assigns ?? []).map((a) => a.mentor_id)));
  const menteeIds = Array.from(
    new Set(cases.map((c) => c.mentee_id).filter(Boolean)),
  ) as string[];
  const [{ data: mentors }, { data: mentees }] = await Promise.all([
    mentorIds.length
      ? supabase.from('users').select('id, name').in('id', mentorIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    menteeIds.length
      ? supabase.from('users').select('id, name, phone').in('id', menteeIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; phone: string | null }[] }),
  ]);
  const mentorNameById = new Map((mentors ?? []).map((m) => [m.id, m.name]));
  const mentorNameByCase = new Map(
    (assigns ?? []).map((a) => [a.case_id, mentorNameById.get(a.mentor_id) ?? null]),
  );
  const mentorIdByCase = new Map((assigns ?? []).map((a) => [a.case_id, a.mentor_id]));
  const mentorAssignedAtByCase = new Map((assigns ?? []).map((a) => [a.case_id, a.assigned_at]));
  const menteeAccById = new Map((mentees ?? []).map((m) => [m.id, m]));

  return cases.map((c) => {
    const t = typeMap.get(c.support_type_id);
    return {
      ...c,
      supportTypeName: t?.name ?? null,
      supportTypeCode: t?.code ?? null,
      mentorName: mentorNameByCase.get(c.id) ?? null,
      mentorId: mentorIdByCase.get(c.id) ?? null,
      mentorAssignedAt: mentorAssignedAtByCase.get(c.id) ?? null,
      regeneratedFormCount: regeneratedByCase.get(c.id) ?? 0,
      hasApplicationPdf: appPdfCaseIds.has(c.id),
      hasBusinessPlan: businessPlanCaseIds.has(c.id),
      menteeLoginId: deriveMenteeLoginId(
        c.mentee_id ? menteeAccById.get(c.mentee_id) : undefined,
      ),
    };
  });
}

/** 멘토 대시보드: 본인에게 배정된 케이스 (RLS 로도 제한되지만 명시적 필터) */
export async function listMentorCases(mentorId: string): Promise<CaseListItem[]> {
  return listCases({ mentorId });
}

/**
 * 회수 후 재등록이 필요한 케이스.
 * 현재 대상자 등록(registered) 상태이면서 과거 배정 이력(mentor_assignments 행)이 있는 케이스 =
 * 한 번 배정됐다가 회수된 케이스. (신규 등록은 배정 이력이 없어 제외된다)
 */
export async function listRecalledCases(): Promise<CaseListItem[]> {
  const registered = await listCases({ status: 'registered' });
  if (registered.length === 0) return [];
  const supabase = createClient();
  const ids = registered.map((c) => c.id);
  const { data: assigns } = await supabase
    .from('mentor_assignments')
    .select('case_id')
    .in('case_id', ids);
  const recalledIds = new Set((assigns ?? []).map((a) => a.case_id));
  return registered.filter((c) => recalledIds.has(c.id));
}

/** 멘티 본인 케이스 (첫 번째) — 없으면 null */
export async function getMenteeCase(menteeId: string): Promise<CaseListItem | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('cases')
    .select('*')
    .eq('mentee_id', menteeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  // 단일 케이스만 보강 조회 (전체 목록 재조회 없이 getCaseById 재사용)
  return getCaseById(data.id);
}

/** 단일 케이스 상세 (유형명·담당멘토명 포함). 접근 불가/없으면 null. */
export async function getCaseById(caseId: string): Promise<CaseListItem | null> {
  const supabase = createClient();
  const { data: c } = await supabase.from('cases').select('*').eq('id', caseId).maybeSingle();
  if (!c) return null;

  // 서로 독립적인 조회는 병렬 실행 (유형·활성배정·서식문서)
  const [{ data: type }, { data: assign }, { data: formDocs }] = await Promise.all([
    supabase.from('support_types').select('name, code').eq('id', c.support_type_id).maybeSingle(),
    supabase
      .from('mentor_assignments')
      .select('mentor_id, assigned_at')
      .eq('case_id', caseId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase.from('documents').select('doc_key').eq('case_id', caseId),
  ]);

  let mentorName: string | null = null;
  if (assign) {
    const { data: mentor } = await supabase
      .from('users')
      .select('name')
      .eq('id', assign.mentor_id)
      .maybeSingle();
    mentorName = mentor?.name ?? null;
  }

  const perKey = new Map<string, number>();
  let hasApplicationPdf = false;
  let hasBusinessPlan = false;
  for (const d of formDocs ?? []) {
    if (!d.doc_key) continue;
    if (d.doc_key === 'application_pdf') hasApplicationPdf = true;
    if (d.doc_key === 'business_plan_attachment') hasBusinessPlan = true;
    if (!d.doc_key.startsWith('form_')) continue;
    perKey.set(d.doc_key, (perKey.get(d.doc_key) ?? 0) + 1);
  }
  const regeneratedFormCount = Array.from(perKey.values()).filter((n) => n > 1).length;

  let menteeAcc: { name: string | null; phone: string | null } | undefined;
  if (c.mentee_id) {
    const { data: mentee } = await supabase
      .from('users')
      .select('name, phone')
      .eq('id', c.mentee_id)
      .maybeSingle();
    menteeAcc = mentee ?? undefined;
  }

  return {
    ...c,
    supportTypeName: type?.name ?? null,
    supportTypeCode: type?.code ?? null,
    mentorName,
    mentorId: assign?.mentor_id ?? null,
    mentorAssignedAt: assign?.assigned_at ?? null,
    regeneratedFormCount,
    hasApplicationPdf,
    hasBusinessPlan,
    menteeLoginId: deriveMenteeLoginId(menteeAcc),
  };
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

/** 지원유형 목록 (필터 드롭다운용) */
export async function listSupportTypes(): Promise<Pick<SupportType, 'id' | 'name' | 'code'>[]> {
  const supabase = createClient();
  const { data } = await supabase.from('support_types').select('id, name, code').order('name');
  return data ?? [];
}

/** 멘토 목록 (필터·배정용) */
export async function listMentors(): Promise<{ id: string; name: string }[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('users')
    .select('id, name')
    .eq('role', 'mentor')
    .eq('is_active', true)
    .order('name');
  return data ?? [];
}
