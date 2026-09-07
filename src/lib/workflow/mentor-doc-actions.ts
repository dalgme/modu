'use server';

import { revalidatePath } from 'next/cache';

import { createAdminClient } from '@/lib/supabase/admin';
import { moveFile, sha256Hex } from '@/lib/storage/files';
import { saveContractorConfig, type ContractorConfig } from '@/lib/data/contractor-config';
import { deleteCaseDocsByKey } from '@/lib/data/case-docs';
import { resolveCaseDocEditor } from '@/lib/workflow/case-editor';

export type SimpleResult = { ok: true } | { ok: false; error: string };

export interface DocStaging {
  stagingPath: string;
  fileName: string;
  mimeType: string;
}

/**
 * 편집 가능한 케이스 서류 doc_key 허용 여부.
 * - applicant_biz_reg (멘티기업 사업자등록증)
 * - support_application_file (지원신청서 완성본 파일 — 임시 수정 재업로드용)
 * - pledge_no_overlap_file (사업참여 및 중복지원 금지 확약서 · 붙임6 완성본 업로드)
 * - contractor_* (공사업체 서류: 업체별 견적서/비교견적서/사업자등록증/옥외광고업등록증/추가첨부 등)
 */
function isAllowedDocKey(docKey: string): boolean {
  return (
    docKey === 'applicant_biz_reg' ||
    docKey === 'support_application_file' ||
    docKey === 'pledge_no_overlap_file' ||
    docKey.startsWith('contractor_')
  );
}

/** 멘토: 케이스 서류 첨부 (허용 doc_key 한정). 브라우저가 _staging 에 올린 경로를 이관. */
export async function attachCaseDocAction(
  caseId: string,
  docKey: string,
  docLabel: string,
  staging: DocStaging,
): Promise<SimpleResult> {
  if (!isAllowedDocKey(docKey)) return { ok: false, error: '허용되지 않은 서류 유형입니다.' };
  const editor = await resolveCaseDocEditor(caseId);
  if (!editor) return { ok: false, error: '수정 권한이 없습니다.' };
  const profile = editor;
  const admin = createAdminClient();
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
    doc_key: docKey,
    doc_name: staging.fileName || docLabel,
    storage_path: dest,
    sha256: sha256Hex(buffer),
    uploaded_by: profile.id,
    file_size: buffer.byteLength,
    mime_type: staging.mimeType || 'application/octet-stream',
  });
  if (insErr) return { ok: false, error: insErr.message };

  // 상호배타: '업로드'는 같은 서류의 '웹 생성본'을 대체한다 (둘 다 남지 않도록).
  if (docKey === 'pledge_no_overlap_file') {
    await deleteCaseDocsByKey(caseId, 'form_pledge_no_overlap');
  } else if (docKey === 'support_application_file') {
    await deleteCaseDocsByKey(caseId, 'support_application');
  }

  revalidatePath(`/mentor/cases/${caseId}`);
  revalidatePath(`/mentor/cases/${caseId}/apply`);
  revalidatePath(`/mentor/cases/${caseId}/contractor-docs`);
  revalidatePath(`/nextlab/cases/${caseId}`);
  revalidatePath(`/institution/cases/${caseId}`);
  return { ok: true };
}

/** 멘토: 케이스 서류 삭제 (허용 doc_key·해당 케이스 한정) */
export async function deleteCaseDocAction(caseId: string, docId: string): Promise<SimpleResult> {
  const editor = await resolveCaseDocEditor(caseId);
  if (!editor) return { ok: false, error: '수정 권한이 없습니다.' };
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('documents')
    .select('storage_path, doc_key')
    .eq('id', docId)
    .eq('case_id', caseId)
    .maybeSingle();
  if (!doc || !doc.doc_key || !isAllowedDocKey(doc.doc_key)) {
    return { ok: false, error: '파일을 찾을 수 없습니다.' };
  }
  if (doc.storage_path) await admin.storage.from('documents').remove([doc.storage_path]);
  await admin.from('documents').delete().eq('id', docId).eq('case_id', caseId);

  revalidatePath(`/mentor/cases/${caseId}`);
  revalidatePath(`/mentor/cases/${caseId}/apply`);
  revalidatePath(`/mentor/cases/${caseId}/contractor-docs`);
  revalidatePath(`/nextlab/cases/${caseId}`);
  revalidatePath(`/institution/cases/${caseId}`);
  return { ok: true };
}

/** 멘토: 공사업체 구성(업체 수·간판 포함·간판업체 지정) 저장 */
export async function saveContractorConfigAction(
  caseId: string,
  input: { companyCount: number; signageIncluded: boolean; signageCompanyIndex: number | null },
): Promise<SimpleResult> {
  const editor = await resolveCaseDocEditor(caseId);
  if (!editor) return { ok: false, error: '수정 권한이 없습니다.' };
  const profile = editor;
  const count = Math.floor(Number(input.companyCount));
  if (!Number.isFinite(count) || count < 1 || count > 10) {
    return { ok: false, error: '업체 수는 1~10 사이로 입력하세요.' };
  }
  const signageIncluded = !!input.signageIncluded;
  let signageCompanyIndex: number | null = null;
  if (signageIncluded) {
    const idx = Math.floor(Number(input.signageCompanyIndex));
    if (!Number.isFinite(idx) || idx < 1 || idx > count) {
      return { ok: false, error: '간판(옥외광고) 공사업체를 지정하세요.' };
    }
    signageCompanyIndex = idx;
  }
  const config: ContractorConfig = { companyCount: count, signageIncluded, signageCompanyIndex };
  await saveContractorConfig(caseId, config, profile.id);
  revalidatePath(`/mentor/cases/${caseId}/contractor-docs`);
  revalidatePath(`/mentor/cases/${caseId}`);
  return { ok: true };
}
