import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

export interface OperatorRequestRow {
  id: string;
  case_id: string | null;
  title: string;
  body: string;
  created_by: string | null;
  read_at: string | null;
  read_by: string | null;
  created_at: string;
  updated_at: string;
  /** 0080: 행사 · 담당 지정 · 처리 완료 */
  program_id: string | null;
  assigned_to: string | null;
  done_at: string | null;
  done_by: string | null;
}

/** 목록 표시용(작성자·업체명 조인) */
export interface OperatorRequestListItem extends OperatorRequestRow {
  businessName: string | null;
  createdByName: string | null;
  assignedToName: string | null;
  doneByName: string | null;
}

/** operator_requests 는 타입 생성 전(0034) 테이블이라 loosely-typed 클라이언트로 접근한다. */
function orTable(client: SupabaseClient) {
  return client.from('operator_requests');
}

/**
 * 발주처 요청 전체 목록 (최신순) — 운영진 열람. 업체명·작성자·담당자·처리자 이름 보강.
 * programId 를 주면 그 행사 요청만 (0080) — 스태프 호출부는 ctx.programId 를 넘길 것.
 */
export async function listOperatorRequests(programId?: string | null, limit = 100): Promise<OperatorRequestListItem[]> {
  const supabase = createClient() as unknown as SupabaseClient;
  let q = orTable(supabase)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (programId) q = q.eq('program_id', programId);
  const { data } = await q;
  const rows = (data ?? []) as OperatorRequestRow[];
  if (rows.length === 0) return [];

  const typed = createClient();
  const caseIds = Array.from(new Set(rows.map((r) => r.case_id).filter(Boolean))) as string[];
  const creatorIds = Array.from(
    new Set(rows.flatMap((r) => [r.created_by, r.assigned_to, r.done_by]).filter(Boolean)),
  ) as string[];

  const [{ data: cases }, { data: users }] = await Promise.all([
    caseIds.length
      ? typed.from('cases').select('id, business_name').in('id', caseIds)
      : Promise.resolve({ data: [] as { id: string; business_name: string }[] }),
    creatorIds.length
      ? typed.from('users').select('id, name').in('id', creatorIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const bizById = new Map((cases ?? []).map((c) => [c.id, c.business_name]));
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));

  return rows.map((r) => ({
    ...r,
    businessName: r.case_id ? (bizById.get(r.case_id) ?? null) : null,
    createdByName: r.created_by ? (nameById.get(r.created_by) ?? null) : null,
    assignedToName: r.assigned_to ? (nameById.get(r.assigned_to) ?? null) : null,
    doneByName: r.done_by ? (nameById.get(r.done_by) ?? null) : null,
  }));
}

/** 특정 작성자(발주처 본인)가 등록한 요청 목록 (최신순) */
export async function listMyOperatorRequests(
  createdBy: string,
  limit = 50,
): Promise<OperatorRequestListItem[]> {
  const supabase = createClient() as unknown as SupabaseClient;
  const { data } = await orTable(supabase)
    .select('*')
    .eq('created_by', createdBy)
    .order('created_at', { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as OperatorRequestRow[];
  if (rows.length === 0) return [];

  const typed = createClient();
  const caseIds = Array.from(new Set(rows.map((r) => r.case_id).filter(Boolean))) as string[];
  const { data: cases } = caseIds.length
    ? await typed.from('cases').select('id, business_name').in('id', caseIds)
    : { data: [] as { id: string; business_name: string }[] };
  const bizById = new Map((cases ?? []).map((c) => [c.id, c.business_name]));

  return rows.map((r) => ({
    ...r,
    businessName: r.case_id ? (bizById.get(r.case_id) ?? null) : null,
    createdByName: null,
    assignedToName: null,
    doneByName: null,
  }));
}

/** 읽지 않은 발주처 요청 수 (운영사 강조·배지용). programId 로 행사 범위. */
export async function countUnreadOperatorRequests(programId?: string | null): Promise<number> {
  const supabase = createClient() as unknown as SupabaseClient;
  let q = orTable(supabase)
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (programId) q = q.eq('program_id', programId);
  const { count } = await q;
  return count ?? 0;
}

/** 미처리(done_at null) 발주처 요청 수 — 게시판 탭 배지용 */
export async function countOpenOperatorRequests(programId?: string | null): Promise<number> {
  const supabase = createClient() as unknown as SupabaseClient;
  let q = orTable(supabase)
    .select('id', { count: 'exact', head: true })
    .is('done_at', null);
  if (programId) q = q.eq('program_id', programId);
  const { count } = await q;
  return count ?? 0;
}
