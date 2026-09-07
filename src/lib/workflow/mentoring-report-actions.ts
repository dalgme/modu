'use server';

import { revalidatePath } from 'next/cache';

import { mentorOrNull, MENTOR_ONLY_ERROR } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { moveFile, sha256Hex } from '@/lib/storage/files';
import { MENTORING_REPORT_DOC_KEY } from '@/lib/data/mentoring-logs';

export type SimpleResult = { ok: true } | { ok: false; error: string };

export interface ReportStaging {
  stagingPath: string;
  fileName: string;
  mimeType: string;
}

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
 * 멘토링 보고서(컨설팅 결과보고서) '완성본 파일' 첨부.
 * 웹 작성 대신 완성된 파일을 올리는 경로. 첨부만으로도 진행단계가 log_completed 로 전진해
 * 진흥원·넥스트랩 진행율에 반영된다(브라우저가 documents 버킷 _staging 에 직접 업로드 후 경로 전달).
 */
export async function attachMentoringReportAction(
  caseId: string,
  staging: ReportStaging,
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
    doc_key: MENTORING_REPORT_DOC_KEY,
    doc_name: staging.fileName || '멘토링 보고서',
    storage_path: dest,
    sha256: sha256Hex(buffer),
    uploaded_by: profile.id,
    file_size: buffer.byteLength,
    mime_type: staging.mimeType || 'application/octet-stream',
  });
  if (insErr) return { ok: false, error: insErr.message };

  // 진행단계 전이: 첫 제출에서만 mentor_assigned/contacted → log_completed
  const { data: transitioned } = await admin
    .from('cases')
    .update({ status: 'log_completed' })
    .eq('id', caseId)
    .in('status', ['mentor_assigned', 'contacted'])
    .select('id');
  if (transitioned && transitioned.length > 0) {
    await admin.from('case_status_history').insert({
      case_id: caseId,
      from_status: 'contacted',
      to_status: 'log_completed',
      changed_by: profile.id,
      note: '멘토링 보고서 파일 첨부',
    });
  }

  await admin.from('audit_logs').insert({
    actor_id: profile.id,
    action: 'case.mentoring_report_attach',
    entity_type: 'cases',
    entity_id: caseId,
  });

  revalidatePath(`/mentor/cases/${caseId}/log`);
  revalidatePath(`/mentor/cases/${caseId}`);
  return { ok: true };
}

/** 첨부한 멘토링 보고서 파일 삭제 (담당 멘토, 해당 케이스·doc_key 한정) */
export async function deleteMentoringReportAction(
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
  if (!doc || doc.doc_key !== MENTORING_REPORT_DOC_KEY) {
    return { ok: false, error: '파일을 찾을 수 없습니다.' };
  }
  if (doc.storage_path) await admin.storage.from('documents').remove([doc.storage_path]);
  await admin.from('documents').delete().eq('id', docId).eq('case_id', caseId);

  revalidatePath(`/mentor/cases/${caseId}/log`);
  revalidatePath(`/mentor/cases/${caseId}`);
  return { ok: true };
}
