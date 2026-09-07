'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { requireInstitution, requireNextlab } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

export type OperatorRequestResult = { ok: true } | { ok: false; error: string };

/**
 * 진흥원: 운영사(넥스트랩) 요청 등록. 해당 케이스(멘티기업) 기준으로 제목·요청사항을 보낸다.
 * created_by 는 서버 세션에서 강제(위조 방지). RLS(is_institution + created_by=auth.uid())로도 이중 검증.
 */
export async function createOperatorRequestAction(input: {
  caseId?: string | null;
  title: string;
  body: string;
}): Promise<OperatorRequestResult> {
  const profile = await requireInstitution();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { ok: false, error: '제목을 입력하세요.' };
  if (!body) return { ok: false, error: '요청사항을 입력하세요.' };
  if (title.length > 200) return { ok: false, error: '제목이 너무 깁니다. (200자 이내)' };

  const supabase = createClient() as unknown as SupabaseClient;
  const { error } = await supabase.from('operator_requests').insert({
    case_id: input.caseId ?? null,
    title,
    body,
    created_by: profile.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/nextlab/dashboard');
  return { ok: true };
}

/** 넥스트랩: 운영사 요청 읽음 처리 (강조 해제). */
export async function markOperatorRequestReadAction(id: string): Promise<OperatorRequestResult> {
  const profile = await requireNextlab();
  const supabase = createClient() as unknown as SupabaseClient;
  const { error } = await supabase
    .from('operator_requests')
    .update({ read_at: new Date().toISOString(), read_by: profile.id })
    .eq('id', id)
    .is('read_at', null);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/nextlab/dashboard');
  return { ok: true };
}
