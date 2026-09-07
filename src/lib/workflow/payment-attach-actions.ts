'use server';

import { revalidatePath } from 'next/cache';

import { requireNextlab } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { queueNotification } from '@/lib/workflow/notifications';
import { moveFile, sha256Hex } from '@/lib/storage/files';
import { PAYMENT_FILE_DOC_KEY } from '@/lib/data/payment-files';

export type SimpleResult = { ok: true } | { ok: false; error: string };

export interface PaymentStaging {
  stagingPath: string;
  fileName: string;
  mimeType: string;
}

/** 지급신청서 작성 가능 단계 (payment.ts 의 PAYMENT_DRAFTABLE 과 동일) */
const PAYMENT_DRAFTABLE = ['execution_docs_submitted', 'payment_application_drafted'];

/**
 * 지급신청서 '완성본 파일' 첨부(웹 작성 대신). 넥스트랩 전용.
 * 완성본 저장 + 진행단계 execution_docs_submitted → payment_application_drafted 전이 →
 * 진행율 반영 + 진흥원 지급승인 대기 알림.
 */
export async function attachPaymentFileAction(
  caseId: string,
  staging: PaymentStaging,
): Promise<SimpleResult> {
  const profile = await requireNextlab();
  const admin = createAdminClient();
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
  if (!PAYMENT_DRAFTABLE.includes(caseRow.status)) {
    return {
      ok: false,
      error: '지금은 지급신청서를 제출할 수 없는 단계입니다. (시공·지급증빙 등록 후 가능)',
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
    doc_key: PAYMENT_FILE_DOC_KEY,
    doc_name: staging.fileName || '지급신청서',
    storage_path: dest,
    sha256: sha256Hex(buffer),
    uploaded_by: profile.id,
    file_size: buffer.byteLength,
    mime_type: staging.mimeType || 'application/octet-stream',
  });
  if (insErr) return { ok: false, error: insErr.message };

  // 진행단계 전이: execution_docs_submitted → payment_application_drafted (이미 drafted면 그대로)
  const { data: transitioned } = await admin
    .from('cases')
    .update({ status: 'payment_application_drafted' })
    .eq('id', caseId)
    .eq('status', 'execution_docs_submitted')
    .select('id');
  if (transitioned && transitioned.length > 0) {
    await admin.from('case_status_history').insert({
      case_id: caseId,
      from_status: 'execution_docs_submitted',
      to_status: 'payment_application_drafted',
      changed_by: profile.id,
      note: '지급신청서 파일 첨부',
    });
    // 진흥원 지급승인 대기 알림
    const { data: institutions } = await admin.from('users').select('id').eq('role', 'institution');
    for (const u of institutions ?? []) {
      await queueNotification(admin, {
        caseId,
        recipientId: u.id,
        triggerEvent: 'payment_application_drafted',
      });
    }
  }

  await admin.from('audit_logs').insert({
    actor_id: profile.id,
    action: 'case.payment_file_attach',
    entity_type: 'cases',
    entity_id: caseId,
  });

  revalidatePath(`/nextlab/cases/${caseId}`);
  revalidatePath(`/institution/cases/${caseId}`);
  return { ok: true };
}

/** 첨부한 지급신청서 파일 삭제 (넥스트랩, 해당 케이스·doc_key 한정) */
export async function deletePaymentFileAction(
  caseId: string,
  docId: string,
): Promise<SimpleResult> {
  await requireNextlab();
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('documents')
    .select('storage_path, doc_key')
    .eq('id', docId)
    .eq('case_id', caseId)
    .maybeSingle();
  if (!doc || doc.doc_key !== PAYMENT_FILE_DOC_KEY) {
    return { ok: false, error: '파일을 찾을 수 없습니다.' };
  }
  if (doc.storage_path) await admin.storage.from('documents').remove([doc.storage_path]);
  await admin.from('documents').delete().eq('id', docId).eq('case_id', caseId);

  revalidatePath(`/nextlab/cases/${caseId}`);
  revalidatePath(`/institution/cases/${caseId}`);
  return { ok: true };
}
