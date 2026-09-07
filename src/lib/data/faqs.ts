import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface FaqRow {
  id: string;
  audience: string;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

/** faqs 는 타입 생성 전(0032) 테이블이라 loosely-typed 클라이언트로 접근한다. */
function faqTable(client: SupabaseClient) {
  return client.from('faqs');
}

/** 게시된 FAQ 목록 (대상 역할 열람용) */
export async function listPublishedFaqs(audience = 'mentor'): Promise<FaqRow[]> {
  const supabase = createClient() as unknown as SupabaseClient;
  const { data } = await faqTable(supabase)
    .select('*')
    .eq('audience', audience)
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return (data ?? []) as FaqRow[];
}

/** 전체 FAQ 목록 (운영진 관리용 · service_role) */
export async function listAllFaqs(audience = 'mentor'): Promise<FaqRow[]> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const { data } = await faqTable(admin)
    .select('*')
    .eq('audience', audience)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return (data ?? []) as FaqRow[];
}
