'use server';

import { revalidatePath } from 'next/cache';

import { getSessionProfile, getRealSessionProfile } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { moveFile, sha256Hex } from '@/lib/storage/files';
import { isPaymentDocKey } from '@/lib/workflow/payment-doc-keys';

export type SimpleResult = { ok: true } | { ok: false; error: string };

export interface DocStaging {
  stagingPath: string;
  fileName: string;
  mimeType: string;
}

/**
 * 이 케이스의 '지급신청서 서류'를 업로드/삭제할 수 있는 주체를 확인한다.
 *  - 담당 활성 멘토
 *  - 멘티기업(케이스에 연결된 멘티 계정)
 *  - 넥스트랩
 * 허용되면 { id } 반환, 아니면 null.
 */
async function resolvePaymentDocEditor(caseId: string): Promise<{ id: string } | null> {
  const profile = await getSessionProfile();
  const real = await getRealSessionProfile();
  if (!profile || !profile.is_active) return null;
  const admin = createAdminClient();

  // 넥스트랩이 '자기 명의로' 등록하는 경로는 종전대로 항상 허용.
  // 단 대행 중에는 명의가 대상 멘토가 되므로, 그 멘토가 실제로 배정된 케이스인지 아래 멘토 분기에서 확인한다
  // (배정 확인 없이 통과시키면 무관한 멘토 명의로 임의 케이스에 서류가 등록된다).
  if (real?.role === 'nextlab' && real.is_active && real.id === profile.id) {
    return { id: profile.id };
  }
  if (profile.role === 'mentor') {
    const { data } = await admin
      .from('mentor_assignments')
      .select('id')
      .eq('case_id', caseId)
      .eq('mentor_id', profile.id)
      .eq('is_active', true)
      .maybeSingle();
    return data ? { id: profile.id } : null;
  }
  if (profile.role === 'mentee') {
    const { data } = await admin
      .from('cases')
      .select('mentee_id')
      .eq('id', caseId)
      .maybeSingle();
    return data && data.mentee_id === profile.id ? { id: profile.id } : null;
  }
  return null;
}

/** 지급신청서 서류 첨부 (멘토·멘티·넥스트랩). 브라우저가 _staging 에 올린 경로를 이관. */
export async function attachPaymentDocAction(
  caseId: string,
  docKey: string,
  docLabel: string,
  staging: DocStaging,
): Promise<SimpleResult> {
  if (!isPaymentDocKey(docKey)) return { ok: false, error: '허용되지 않은 서류 유형입니다.' };
  const editor = await resolvePaymentDocEditor(caseId);
  if (!editor) return { ok: false, error: '업로드 권한이 없습니다.' };
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
    uploaded_by: editor.id,
    file_size: buffer.byteLength,
    mime_type: staging.mimeType || 'application/octet-stream',
  });
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePaymentPaths(caseId);
  return { ok: true };
}

/** 지급신청서 서류 삭제 (멘토·멘티·넥스트랩·해당 케이스 한정) */
export async function deletePaymentDocAction(caseId: string, docId: string): Promise<SimpleResult> {
  const editor = await resolvePaymentDocEditor(caseId);
  if (!editor) return { ok: false, error: '삭제 권한이 없습니다.' };
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('documents')
    .select('storage_path, doc_key')
    .eq('id', docId)
    .eq('case_id', caseId)
    .maybeSingle();
  if (!doc || !doc.doc_key || !isPaymentDocKey(doc.doc_key)) {
    return { ok: false, error: '파일을 찾을 수 없습니다.' };
  }
  if (doc.storage_path) await admin.storage.from('documents').remove([doc.storage_path]);
  await admin.from('documents').delete().eq('id', docId).eq('case_id', caseId);

  revalidatePaymentPaths(caseId);
  return { ok: true };
}

function revalidatePaymentPaths(caseId: string): void {
  revalidatePath(`/mentor/cases/${caseId}`);
  revalidatePath(`/mentor/cases/${caseId}/payment`);
  revalidatePath(`/mentee`);
  revalidatePath(`/nextlab/cases/${caseId}`);
  revalidatePath(`/institution/cases/${caseId}`);
}
