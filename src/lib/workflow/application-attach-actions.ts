'use server';

import { revalidatePath } from 'next/cache';

import { mentorOrNull, MENTOR_ONLY_ERROR } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { moveFile, sha256Hex } from '@/lib/storage/files';
import { APPLICATION_FILE_DOC_KEY } from '@/lib/data/application-files';
import { hasActiveEditGrant } from '@/lib/data/edit-grants';
import { deleteCaseDocsByKey } from '@/lib/data/case-docs';

export type SimpleResult = { ok: true } | { ok: false; error: string };

export interface AppStaging {
  stagingPath: string;
  fileName: string;
  mimeType: string;
}

/** 지원신청서 저장 가능 단계 (application.ts 의 SAVEABLE 과 동일 — 멘토링 일지 완료 후) */
const SAVEABLE = ['log_completed', 'contractor_registered', 'application_drafted', 'rejected'];

async function isMentorOfCase(
  admin: ReturnType<typeof createAdminClient>,
  caseId: string,
  mentorId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('mentor_assignments')
    .select('id')
    .eq('case_id', caseId)
    .eq('mentor_id', mentorId)
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}

/**
 * 지원신청서 '완성본 파일' 첨부(웹 작성 대신). 저장만 하며, 넥스트랩 검수 알림·상태 전이는
 * '송신하기' 단계에서 수행한다.
 */
export async function attachApplicationFileAction(
  caseId: string,
  staging: AppStaging,
): Promise<SimpleResult> {
  const profile = await mentorOrNull();
  if (!profile) return { ok: false, error: MENTOR_ONLY_ERROR };
  const admin = createAdminClient();
  if (!(await isMentorOfCase(admin, caseId, profile.id))) {
    return { ok: false, error: '담당 멘토가 아닙니다.' };
  }
  if (!staging.stagingPath.startsWith('_staging/') || staging.stagingPath.includes('..')) {
    return { ok: false, error: '잘못된 업로드 경로입니다.' };
  }
  const basename = staging.stagingPath.split('/').pop();
  if (!basename) return { ok: false, error: '잘못된 업로드 경로입니다.' };

  const { data: caseRow } = await admin
    .from('cases')
    .select('status')
    .eq('id', caseId)
    .maybeSingle();
  if (!caseRow) return { ok: false, error: '케이스에 접근할 수 없습니다.' };
  const editable =
    SAVEABLE.includes(caseRow.status) ||
    (caseRow.status === 'reviewed' && (await hasActiveEditGrant(caseId)));
  if (!editable) {
    return {
      ok: false,
      error: '지금은 지원신청서를 저장할 수 없는 단계입니다. (멘토링 일지 완료 후 가능)',
    };
  }

  const { data: blob, error: dlError } = await admin.storage
    .from('documents')
    .download(staging.stagingPath);
  if (dlError || !blob) return { ok: false, error: '업로드된 파일을 확인할 수 없습니다.' };
  const buffer = Buffer.from(await blob.arrayBuffer());

  const dest = `${caseId}/${basename}`;
  try {
    await moveFile('documents', staging.stagingPath, dest);
  } catch {
    return { ok: false, error: '파일 첨부에 실패했습니다. 다시 시도하세요.' };
  }

  const { error: insErr } = await admin.from('documents').insert({
    case_id: caseId,
    doc_key: APPLICATION_FILE_DOC_KEY,
    doc_name: staging.fileName || '지원신청서',
    storage_path: dest,
    sha256: sha256Hex(buffer),
    uploaded_by: profile.id,
    file_size: buffer.byteLength,
    mime_type: staging.mimeType || 'application/octet-stream',
  });
  if (insErr) return { ok: false, error: insErr.message };

  // 상호배타: 지원신청서 '파일 업로드'는 '웹 생성본(support_application)'을 대체한다.
  await deleteCaseDocsByKey(caseId, 'support_application');

  // 신규 플로우: 파일 첨부는 저장만. 넥스트랩 검수 알림/전이는 '송신하기' 단계에서 수행한다.
  await admin.from('audit_logs').insert({
    actor_id: profile.id,
    action: 'case.application_file_attach',
    entity_type: 'cases',
    entity_id: caseId,
  });

  revalidatePath(`/mentor/cases/${caseId}/apply`);
  revalidatePath(`/mentor/cases/${caseId}`);
  return { ok: true };
}

/** 첨부한 지원신청서 파일 삭제 (담당 멘토, 해당 케이스·doc_key 한정) */
export async function deleteApplicationFileAction(
  caseId: string,
  docId: string,
): Promise<SimpleResult> {
  const profile = await mentorOrNull();
  if (!profile) return { ok: false, error: MENTOR_ONLY_ERROR };
  const admin = createAdminClient();
  if (!(await isMentorOfCase(admin, caseId, profile.id))) {
    return { ok: false, error: '담당 멘토가 아닙니다.' };
  }
  const { data: doc } = await admin
    .from('documents')
    .select('storage_path, doc_key')
    .eq('id', docId)
    .eq('case_id', caseId)
    .maybeSingle();
  if (!doc || doc.doc_key !== APPLICATION_FILE_DOC_KEY) {
    return { ok: false, error: '파일을 찾을 수 없습니다.' };
  }
  if (doc.storage_path) await admin.storage.from('documents').remove([doc.storage_path]);
  await admin.from('documents').delete().eq('id', docId).eq('case_id', caseId);

  revalidatePath(`/mentor/cases/${caseId}/apply`);
  revalidatePath(`/mentor/cases/${caseId}`);
  return { ok: true };
}
