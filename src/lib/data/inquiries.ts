import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';

export type Inquiry = Tables<'inquiries'>;

export const INQUIRY_CATEGORY_LABELS: Record<string, string> = {
  complaint: '불편 신고',
  feature: '기능 요청',
  guide: '가이드 문의',
  other: '기타',
};

export const INQUIRY_STATUS_LABELS: Record<string, string> = {
  open: '접수',
  answered: '답변완료',
  closed: '종료',
};

export interface InquiryWithMeta extends Inquiry {
  menteeName: string | null;
  businessName: string | null;
  /** 답변자 이름 (answered_by) */
  answeredByName: string | null;
  /** 행사 (0080 — database.ts 재생성 전까지 로컬 확장) */
  program_id: string | null;
}

/** 멘티 본인 문의 내역 (최신순) */
export async function listMyInquiries(menteeId: string): Promise<Inquiry[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('inquiries')
    .select('*')
    .eq('mentee_id', menteeId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/**
 * 운영진(운영사)용 전체 문의 목록 — 접수(open) 우선, 최신순.
 * programId 를 주면 그 행사 문의만 (0080 program_id). 없으면 RLS 범위(레거시 호출) — 호출부는 ctx.programId 를 넘길 것.
 */
export async function listInquiries(programId?: string | null, opts: { onlyOpen?: boolean } = {}): Promise<InquiryWithMeta[]> {
  const supabase = createClient();
  let q = supabase
    .from('inquiries')
    .select(
      '*, mentee:users!inquiries_mentee_id_fkey(name), inquiry_case:cases!inquiries_case_id_fkey(business_name), answerer:users!inquiries_answered_by_fkey(name)',
    )
    .order('created_at', { ascending: false });
  if (programId) q = q.eq('program_id', programId);
  if (opts.onlyOpen) q = q.eq('status', 'open');
  const { data } = await q;
  const rows = (data ?? []) as unknown as (Inquiry & {
    program_id?: string | null;
    mentee: { name: string | null } | null;
    inquiry_case: { business_name: string | null } | null;
    answerer: { name: string | null } | null;
  })[];
  // 접수(open) 우선 정렬
  const order = (s: string) => (s === 'open' ? 0 : s === 'answered' ? 1 : 2);
  return rows
    .map((r) => ({
      ...r,
      program_id: r.program_id ?? null,
      menteeName: r.mentee?.name ?? null,
      businessName: r.inquiry_case?.business_name ?? null,
      answeredByName: r.answerer?.name ?? null,
    }))
    .sort((a, b) => order(a.status) - order(b.status));
}

/** 미답변(접수) 문의 수 — 운영사 대시보드 즉시 알림용. programId 로 행사 범위. */
export async function countOpenInquiries(programId?: string | null): Promise<number> {
  const supabase = createClient();
  let q = supabase
    .from('inquiries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open');
  if (programId) q = q.eq('program_id', programId);
  const { count } = await q;
  return count ?? 0;
}
