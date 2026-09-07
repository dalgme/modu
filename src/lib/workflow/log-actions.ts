'use server';

import { revalidatePath } from 'next/cache';

import { mentorOrNull, MENTOR_ONLY_ERROR, getRealSessionProfile } from '@/lib/auth/guards';
import { verifyPassword } from '@/lib/auth/verify-password';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMentorSignatureImage, getMenteeSignatureImage } from '@/lib/data/signatures';
import { mentoringLogSchema } from '@/lib/validations/mentoring-log';
import {
  recordContact,
  submitMentoringLog,
  updateMentoringLog,
  deleteMentoringLog,
} from '@/lib/workflow/mentoring';
import type { WorkflowResult } from '@/lib/workflow/cases';

/** FormData 의 photoPaths(브라우저가 스토리지에 직접 올린 `_staging/…` 경로) 추출 */
function readPhotoPaths(formData: FormData): string[] {
  return formData
    .getAll('photoPaths')
    .map((v) => String(v))
    .filter((p) => p.startsWith('_staging/'));
}

/** 멘티 확인·연락 기록 (3단계) */
export async function recordContactAction(caseId: string): Promise<WorkflowResult> {
  const profile = await mentorOrNull();
  if (!profile) return { ok: false, error: MENTOR_ONLY_ERROR };
  const result = await recordContact(caseId, profile.id);
  if (result.ok) revalidatePath(`/mentor/cases/${caseId}`);
  return result;
}

/** 멘토링 일지 제출 (4단계) — 사진·서명 포함 FormData */
export async function submitMentoringLogAction(formData: FormData): Promise<WorkflowResult> {
  const profile = await mentorOrNull();
  if (!profile) return { ok: false, error: MENTOR_ONLY_ERROR };

  const parsed = mentoringLogSchema.safeParse({
    caseId: formData.get('caseId'),
    visitedAt: formData.get('visitedAt'),
    durationMinutes: formData.get('durationMinutes'),
    place: formData.get('place'),
    topic: formData.get('topic'),
    difficulties: formData.get('difficulties'),
    content: formData.get('content'),
    result: formData.get('result'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }

  const mentorSig = String(formData.get('mentorSignature') ?? '');
  const menteeSig = String(formData.get('menteeSignature') ?? '');
  if (!mentorSig || !menteeSig) {
    return { ok: false, error: '멘토·멘티 서명을 모두 입력하세요.' };
  }

  const result = await submitMentoringLog({
    caseId: parsed.data.caseId,
    mentorId: profile.id,
    visitedAt: parsed.data.visitedAt,
    durationMinutes: parsed.data.durationMinutes,
    place: parsed.data.place,
    topic: parsed.data.topic,
    difficulties: parsed.data.difficulties,
    content: parsed.data.content,
    result: parsed.data.result,
    photoPaths: readPhotoPaths(formData),
    mentorSignatureDataUrl: mentorSig,
    menteeSignatureDataUrl: menteeSig,
  });

  if (result.ok) {
    revalidatePath(`/mentor/cases/${parsed.data.caseId}`);
    revalidatePath('/mentor/dashboard');
  }
  return result;
}

/**
 * 저장된 서명 불러오기 — DB에 저장된 케이스 서명(멘티 미팅 서명·멘토 서명)을 data:URI 로 반환.
 * 담당 멘토만, 자신이 배정된 케이스에 한해 조회한다. 없으면 null.
 */
export async function loadCaseSignatureAction(
  caseId: string,
  signer: 'mentor' | 'mentee',
): Promise<string | null> {
  const profile = await mentorOrNull();
  if (!profile) return null;
  const admin = createAdminClient();
  const { data: assign } = await admin
    .from('mentor_assignments')
    .select('id')
    .eq('case_id', caseId)
    .eq('mentor_id', profile.id)
    .eq('is_active', true)
    .maybeSingle();
  if (!assign) return null;
  return signer === 'mentor'
    ? getMentorSignatureImage(caseId)
    : getMenteeSignatureImage(caseId);
}

/** 작성된 멘토링 일지 수정 (본문 + 선택적 사진/재서명) */
export async function updateMentoringLogAction(formData: FormData): Promise<WorkflowResult> {
  const profile = await mentorOrNull();
  if (!profile) return { ok: false, error: MENTOR_ONLY_ERROR };
  const logId = String(formData.get('logId') ?? '');
  if (!logId) return { ok: false, error: '수정할 일지 정보가 없습니다.' };

  const parsed = mentoringLogSchema.safeParse({
    caseId: formData.get('caseId'),
    visitedAt: formData.get('visitedAt'),
    durationMinutes: formData.get('durationMinutes'),
    place: formData.get('place'),
    topic: formData.get('topic'),
    difficulties: formData.get('difficulties'),
    content: formData.get('content'),
    result: formData.get('result'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }

  const mentorSig = String(formData.get('mentorSignature') ?? '');
  const menteeSig = String(formData.get('menteeSignature') ?? '');

  const result = await updateMentoringLog({
    logId,
    mentorId: profile.id,
    visitedAt: parsed.data.visitedAt,
    durationMinutes: parsed.data.durationMinutes,
    place: parsed.data.place,
    topic: parsed.data.topic,
    difficulties: parsed.data.difficulties,
    content: parsed.data.content,
    result: parsed.data.result,
    photoPaths: readPhotoPaths(formData),
    mentorSignatureDataUrl: mentorSig || undefined,
    menteeSignatureDataUrl: menteeSig || undefined,
  });

  if (result.ok) {
    revalidatePath(`/mentor/cases/${parsed.data.caseId}/log`);
    revalidatePath(`/mentor/cases/${parsed.data.caseId}`);
  }
  return result;
}

/** 멘토링 일지 삭제 — 보안을 위해 로그인 비밀번호 재확인 후 삭제 */
export async function deleteMentoringLogAction(
  caseId: string,
  logId: string,
  password: string,
): Promise<WorkflowResult> {
  const profile = await mentorOrNull();
  if (!profile) return { ok: false, error: MENTOR_ONLY_ERROR };
  // 재확인은 '실제로 누른 사람' 기준이어야 한다. 대행 중에 대상 멘토 비밀번호를 물으면
  // 실행자 본인 확인이 되지 않는다(넥스트랩이 멘토 비밀번호를 알아야 하는 모순도 생긴다).
  const real = await getRealSessionProfile();
  if (!(await verifyPassword(real?.email ?? profile.email ?? '', password ?? ''))) {
    return { ok: false, error: '비밀번호가 올바르지 않습니다. 다시 확인해 주세요.' };
  }
  const result = await deleteMentoringLog(logId, profile.id);
  if (result.ok) {
    revalidatePath(`/mentor/cases/${caseId}/log`);
    revalidatePath(`/mentor/cases/${caseId}`);
  }
  return result;
}
