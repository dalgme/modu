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

/** 운영진(넥스트랩)용 전체 문의 목록 — 접수(open) 우선, 최신순 */
export async function listInquiries(): Promise<InquiryWithMeta[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('inquiries')
    .select(
      '*, mentee:users!inquiries_mentee_id_fkey(name), inquiry_case:cases!inquiries_case_id_fkey(business_name)',
    )
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as unknown as (Inquiry & {
    mentee: { name: string | null } | null;
    inquiry_case: { business_name: string | null } | null;
  })[];
  // 접수(open) 우선 정렬
  const order = (s: string) => (s === 'open' ? 0 : s === 'answered' ? 1 : 2);
  return rows
    .map((r) => ({
      ...r,
      menteeName: r.mentee?.name ?? null,
      businessName: r.inquiry_case?.business_name ?? null,
    }))
    .sort((a, b) => order(a.status) - order(b.status));
}

/** 미답변(접수) 문의 수 — 넥스트랩 대시보드 즉시 알림용 */
export async function countOpenInquiries(): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from('inquiries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open');
  return count ?? 0;
}
