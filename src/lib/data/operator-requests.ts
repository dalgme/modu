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
}

/** 목록 표시용(작성자·업체명 조인) */
export interface OperatorRequestListItem extends OperatorRequestRow {
  businessName: string | null;
  createdByName: string | null;
}

/** operator_requests 는 타입 생성 전(0034) 테이블이라 loosely-typed 클라이언트로 접근한다. */
function orTable(client: SupabaseClient) {
  return client.from('operator_requests');
}

/** 운영사 요청 전체 목록 (최신순) — 운영진 열람. 업체명·작성자명 보강. */
export async function listOperatorRequests(limit = 100): Promise<OperatorRequestListItem[]> {
  const supabase = createClient() as unknown as SupabaseClient;
  const { data } = await orTable(supabase)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as OperatorRequestRow[];
  if (rows.length === 0) return [];

  const typed = createClient();
  const caseIds = Array.from(new Set(rows.map((r) => r.case_id).filter(Boolean))) as string[];
  const creatorIds = Array.from(
    new Set(rows.map((r) => r.created_by).filter(Boolean)),
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
  }));
}

/** 읽지 않은 운영사 요청 수 (운영사 강조·배지용) */
export async function countUnreadOperatorRequests(): Promise<number> {
  const supabase = createClient() as unknown as SupabaseClient;
  const { count } = await orTable(supabase)
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  return count ?? 0;
}
