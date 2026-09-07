'use server';

import { revalidatePath } from 'next/cache';

import {
  getSessionProfile,
  getRealSessionProfile,
  mentorOfCaseOrNull,
  NOT_ASSIGNED_ERROR,
} from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createCaseScopedSignedUrl } from '@/lib/storage/files';
import { generateAttachmentForm } from '@/lib/workflow/attachment-forms';
import { ATTACHMENT_FORM_KEYS, type AttachmentFormKey } from '@/lib/documents/templates';
import type { WorkflowResult } from '@/lib/workflow/cases';

/**
 * 서식 생성·조회 권한: 진흥원·넥스트랩·멘토.
 * 유효 신원(대행 중이면 대상 멘토)이 허용 역할이거나, 실제 신원이 스태프면 통과한다.
 * 반환 id 는 '명의'(문서 uploaded_by)로 쓰이므로 유효 신원을 돌려준다.
 */
async function requireFormActor() {
  const profile = await getSessionProfile();
  const real = await getRealSessionProfile();
  if (!profile || !profile.is_active) return null;
  const byEffective = ['institution', 'nextlab', 'mentor'].includes(profile.role);
  const byReal = !!real && real.is_active && ['institution', 'nextlab'].includes(real.role);
  return byEffective || byReal ? profile : null;
}

function isFormKey(v: string): v is AttachmentFormKey {
  return (ATTACHMENT_FORM_KEYS as readonly string[]).includes(v);
}

/** 동의·확약 서식 PDF 생성 */
export async function generateAttachmentFormAction(
  caseId: string,
  templateKey: string,
): Promise<WorkflowResult> {
  const profile = await requireFormActor();
  if (!profile) return { ok: false, error: '권한이 없습니다.' };
  if (!isFormKey(templateKey)) return { ok: false, error: '허용되지 않은 서식입니다.' };
  // 대행 중에는 명의가 대상 멘토가 되므로, 그 멘토가 배정된 케이스인지 확인한다.
  // (RLS 는 auth.uid()=넥스트랩 기준이라 임의 케이스가 열린다)
  if (profile.role === 'mentor' && !(await mentorOfCaseOrNull(caseId))) {
    return { ok: false, error: NOT_ASSIGNED_ERROR };
  }

  const result = await generateAttachmentForm(caseId, templateKey, profile.id);
  if (result.ok) {
    revalidatePath(`/nextlab/cases/${caseId}`);
    revalidatePath(`/institution/cases/${caseId}`);
    revalidatePath(`/mentor/cases/${caseId}`);
  }
  return result;
}

/** 생성된 동의·확약 서식 PDF 의 signed URL (최신 1건) */
export async function getAttachmentFormPdfUrl(
  caseId: string,
  templateKey: string,
): Promise<string | null> {
  const profile = await requireFormActor();
  if (!profile || !isFormKey(templateKey)) return null;

  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('case_id', caseId)
    .eq('doc_key', `form_${templateKey}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.storage_path) return null;
  return createCaseScopedSignedUrl('documents', caseId, data.storage_path, 300);
}
