'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { requireNextlab } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export type FaqActionResult = { ok: true } | { ok: false; error: string };

function faqTable() {
  return (createAdminClient() as unknown as SupabaseClient).from('faqs');
}

function revalidate() {
  revalidatePath('/admin/settings/faq');
  revalidatePath('/mentor/guide');
}

/** FAQ 추가 (운영사) */
export async function createFaqAction(input: {
  audience?: string;
  question: string;
  answer: string;
  sortOrder?: number;
  isPublished?: boolean;
}): Promise<FaqActionResult> {
  await requireNextlab();
  const question = (input.question ?? '').trim();
  const answer = (input.answer ?? '').trim();
  if (!question || !answer) return { ok: false, error: '질문과 답변을 모두 입력하세요.' };

  const { error } = await faqTable().insert({
    audience: input.audience ?? 'mentor',
    question,
    answer,
    sort_order: input.sortOrder ?? 0,
    is_published: input.isPublished ?? true,
  });
  if (error) return { ok: false, error: 'FAQ 추가에 실패했습니다.' };
  revalidate();
  return { ok: true };
}

/** FAQ 수정 (운영사) */
export async function updateFaqAction(input: {
  id: string;
  question: string;
  answer: string;
  sortOrder?: number;
  isPublished?: boolean;
}): Promise<FaqActionResult> {
  await requireNextlab();
  const question = (input.question ?? '').trim();
  const answer = (input.answer ?? '').trim();
  if (!input.id) return { ok: false, error: '대상을 확인할 수 없습니다.' };
  if (!question || !answer) return { ok: false, error: '질문과 답변을 모두 입력하세요.' };

  const { error } = await faqTable()
    .update({
      question,
      answer,
      sort_order: input.sortOrder ?? 0,
      is_published: input.isPublished ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id);
  if (error) return { ok: false, error: 'FAQ 수정에 실패했습니다.' };
  revalidate();
  return { ok: true };
}

/** FAQ 삭제 (운영사) */
export async function deleteFaqAction(id: string): Promise<FaqActionResult> {
  await requireNextlab();
  if (!id) return { ok: false, error: '대상을 확인할 수 없습니다.' };
  const { error } = await faqTable().delete().eq('id', id);
  if (error) return { ok: false, error: 'FAQ 삭제에 실패했습니다.' };
  revalidate();
  return { ok: true };
}
