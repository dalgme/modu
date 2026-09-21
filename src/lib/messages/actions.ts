'use server';

import { revalidatePath } from 'next/cache';

import { roleOrNull, mentorOfCaseOrNull } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export type MessageActionResult = { ok: true } | { ok: false; error: string };

/**
 * 담당 멘토 ↔ 멘티 메시지 전송.
 * 발신자는 그 케이스의 활성 멘토 또는 멘티 본인만 — RLS 에 기대지 않고 코드에서 직접 확인한다(대행 중 auth.uid()=실행자).
 * 수신자는 상대방(멘토 ↔ 멘티)으로 서버가 결정한다.
 */
export async function sendCaseMessageAction(caseId: string, body: string): Promise<MessageActionResult> {
  const text = (body ?? '').trim();
  if (!text) return { ok: false, error: '내용을 입력하세요.' };
  if (text.length > 4000) return { ok: false, error: '메시지는 4000자 이내로 입력하세요.' };

  const profile = await roleOrNull(['mentor', 'mentee']);
  if (!profile) return { ok: false, error: '멘토·멘티만 보낼 수 있습니다.' };

  const admin = createAdminClient();
  const { data: caseRow } = await admin
    .from('cases')
    .select('id, program_id, mentee_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!caseRow) return { ok: false, error: '케이스를 찾을 수 없습니다.' };

  let recipientId: string | null = null;
  if (profile.role === 'mentee') {
    if (caseRow.mentee_id !== profile.id) return { ok: false, error: '본인 케이스에서만 보낼 수 있습니다.' };
    const { data: assign } = await admin
      .from('mentor_assignments')
      .select('mentor_id')
      .eq('case_id', caseId)
      .eq('is_active', true)
      .maybeSingle();
    recipientId = assign?.mentor_id ?? null;
    if (!recipientId) return { ok: false, error: '아직 담당 멘토가 배정되지 않았습니다.' };
  } else {
    const mentor = await mentorOfCaseOrNull(caseId);
    if (!mentor) return { ok: false, error: '담당 멘토가 아닙니다.' };
    recipientId = caseRow.mentee_id;
    if (!recipientId) return { ok: false, error: '멘티 계정이 아직 연결되지 않았습니다.' };
  }

  const { error } = await admin.from('direct_messages').insert({
    program_id: caseRow.program_id,
    case_id: caseId,
    sender_id: profile.id,
    recipient_id: recipientId,
    body: text,
  });
  if (error) return { ok: false, error: '전송에 실패했습니다. 잠시 후 다시 시도하세요.' };

  revalidatePath('/mentor/qna');
  revalidatePath('/mentee/inquiries');
  revalidatePath('/nextlab/board');
  return { ok: true };
}
