'use server';

import { revalidatePath } from 'next/cache';

import { requireMentee, requireNextlab } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getMenteeCase } from '@/lib/data/cases';
import { logAudit } from '@/lib/workflow/audit';

export type InquiryResult = { ok: true } | { ok: false; error: string };

const CATEGORIES = ['complaint', 'feature', 'guide', 'other'];

/** 멘티: 문의 등록 → 넥스트랩 대시보드에 즉시 노출(접수 카운트·목록 갱신) */
export async function submitInquiryAction(input: {
  category: string;
  subject: string;
  body: string;
}): Promise<InquiryResult> {
  const profile = await requireMentee();
  const category = CATEGORIES.includes(input.category) ? input.category : 'other';
  const subject = input.subject?.trim() ?? '';
  const body = input.body?.trim() ?? '';
  if (subject.length < 2) return { ok: false, error: '제목을 입력하세요.' };
  if (body.length < 5) return { ok: false, error: '문의 내용을 5자 이상 입력하세요.' };

  const myCase = await getMenteeCase(profile.id);
  const supabase = createClient();
  const { error } = await supabase.from('inquiries').insert({
    mentee_id: profile.id,
    case_id: myCase?.id ?? null,
    category,
    subject,
    body,
  });
  if (error) return { ok: false, error: error.message };

  await logAudit(supabase, {
    actorId: profile.id,
    action: 'inquiry.create',
    entityType: 'inquiries',
    entityId: profile.id,
    metadata: { category, subject },
  });

  // 멘티 목록 + 넥스트랩 대시보드/문의관리 즉시 갱신
  revalidatePath('/mentee/inquiries');
  revalidatePath('/nextlab/dashboard');
  revalidatePath('/nextlab/inquiries');
  return { ok: true };
}

/** 넥스트랩: 문의 답변 (상태 answered 전이) */
export async function answerInquiryAction(input: {
  id: string;
  answer: string;
}): Promise<InquiryResult> {
  const profile = await requireNextlab();
  const answer = input.answer?.trim() ?? '';
  if (answer.length < 2) return { ok: false, error: '답변 내용을 입력하세요.' };

  const supabase = createClient();
  const { error } = await supabase
    .from('inquiries')
    .update({
      answer,
      status: 'answered',
      answered_by: profile.id,
      answered_at: new Date().toISOString(),
    })
    .eq('id', input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/nextlab/inquiries');
  revalidatePath('/nextlab/dashboard');
  revalidatePath('/mentee/inquiries');
  return { ok: true };
}
