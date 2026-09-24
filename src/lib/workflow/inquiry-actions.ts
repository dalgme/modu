'use server';

import { revalidatePath } from 'next/cache';

import { requireMentee, requireNextlab } from '@/lib/auth/guards';
import { getImpersonation } from '@/lib/auth/impersonation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMenteeCase } from '@/lib/data/cases';
import { logAudit } from '@/lib/workflow/audit';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';

export type InquiryResult = { ok: true } | { ok: false; error: string };

const CATEGORIES = ['complaint', 'feature', 'guide', 'other'];

/** 멘티: 문의 등록 → 운영사 대시보드에 즉시 노출(접수 카운트·목록 갱신). program_id 는 케이스 → 컨텍스트 순으로 정한다 (0080). */
export async function submitInquiryAction(input: {
  category: string;
  subject: string;
  body: string;
}): Promise<InquiryResult> {
  const profile = await requireMentee();
  // 대행 중 차단 (P31) — inquiries RLS 는 mentee_id = auth.uid() 라 대행 중엔 실행자 명의로 새거나 거부된다. 문의는 멘티 본인만.
  if (await getImpersonation()) return { ok: false, error: '문의 등록은 멘티 본인만 할 수 있습니다.' };
  const category = CATEGORIES.includes(input.category) ? input.category : 'other';
  const subject = input.subject?.trim() ?? '';
  const body = input.body?.trim() ?? '';
  if (subject.length < 2) return { ok: false, error: '제목을 입력하세요.' };
  if (body.length < 5) return { ok: false, error: '문의 내용을 5자 이상 입력하세요.' };

  const myCase = await getMenteeCase(profile.id);
  const ctx = await contextOrNull(profile);
  const programId = myCase?.program_id ?? ctx?.programId ?? null;
  const supabase = createClient();
  const { error } = await supabase.from('inquiries').insert({
    mentee_id: profile.id,
    case_id: myCase?.id ?? null,
    category,
    subject,
    body,
    program_id: programId,
  });
  if (error) {
    // RLS 위반(42501) 등은 원문 대신 한국어 안내 (P31)
    if (error.code === '42501' || /row-level security/i.test(error.message)) return { ok: false, error: '문의를 등록할 권한이 없습니다. 멘티 본인 계정으로 로그인했는지 확인하세요.' };
    return { ok: false, error: `문의 등록에 실패했습니다: ${error.message}` };
  }

  await logAudit(supabase, {
    actorId: profile.id,
    programId,
    action: 'inquiry.create',
    entityType: 'inquiries',
    entityId: profile.id,
    metadata: { category, subject },
  });

  // 멘티 목록 + 운영사 대시보드/문의관리 즉시 갱신
  revalidatePath('/mentee/inquiries');
  revalidatePath('/nextlab/dashboard');
  revalidatePath('/nextlab/board');
  return { ok: true };
}

/**
 * 운영사: 문의 답변 (상태 answered 전이). `review`(검수·요청 처리) 권한 — 옵저버 차단.
 *  - 문의가 현재 행사 소속인지 확인 (program_id, 레거시 null 이면 케이스의 행사로 판정)
 *  - 첫 답변은 status='open' 조건부 update (두 담당자가 동시에 답하면 한 명만 성공)
 *  - 답변 수정은 화면이 본 updated_at 과 같을 때만 (그 사이 다른 담당자가 고쳤으면 충돌)
 *  - answered_by 기록 + 감사 'inquiry.answer'
 */
export async function answerInquiryAction(input: {
  id: string;
  answer: string;
  /** 화면이 렌더될 때의 inquiries.updated_at — 수정 시 충돌 감지 */
  updatedAt?: string | null;
}): Promise<InquiryResult> {
  const profile = await requireNextlab();
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  { const denied = denyUnless(ctx, 'review'); if (denied) return { ok: false, error: denied }; }
  const answer = input.answer?.trim() ?? '';
  if (answer.length < 2) return { ok: false, error: '답변 내용을 입력하세요.' };

  const admin = createAdminClient();
  const { data: row } = await admin.from('inquiries').select('id, status, updated_at, case_id, program_id, mentee_id').eq('id', input.id).maybeSingle();
  const inq = row as unknown as { id: string; status: string; updated_at: string; case_id: string | null; program_id: string | null; mentee_id: string } | null;
  if (!inq) return { ok: false, error: '문의를 찾을 수 없습니다.' };
  let programId = inq.program_id;
  if (!programId && inq.case_id) {
    const { data: c } = await admin.from('cases').select('program_id').eq('id', inq.case_id).maybeSingle();
    programId = c?.program_id ?? null;
  }
  if (programId && programId !== ctx.programId) return { ok: false, error: '이 행사의 문의가 아닙니다.' };

  const now = new Date().toISOString();
  const patch = { answer, status: 'answered', answered_by: profile.id, answered_at: now, ...(programId ? {} : { program_id: ctx.programId }) };
  let q = admin.from('inquiries').update(patch).eq('id', inq.id);
  const firstAnswer = inq.status === 'open';
  if (firstAnswer) q = q.eq('status', 'open');
  else if (input.updatedAt) q = q.eq('updated_at', input.updatedAt);
  const { data: updated, error } = await q.select('id');
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: firstAnswer ? '다른 담당자가 방금 이 문의에 답변했습니다. 새로고침 후 확인하세요.' : '다른 담당자가 방금 이 답변을 수정했습니다. 새로고침 후 다시 확인하세요.' };
  }

  await logAudit(admin, {
    actorId: profile.id,
    programId: ctx.programId,
    action: 'inquiry.answer',
    entityType: 'inquiries',
    entityId: inq.id,
    metadata: { edit: !firstAnswer, mentee_id: inq.mentee_id, case_id: inq.case_id },
  });

  revalidatePath('/nextlab/board');
  revalidatePath('/nextlab/dashboard');
  revalidatePath('/mentee/inquiries');
  return { ok: true };
}
