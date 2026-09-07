'use server';

import { revalidatePath } from 'next/cache';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  moveFile,
  createCaseScopedSignedUrl,
  sha256Hex,
  dataUrlToBuffer,
  uploadFile,
} from '@/lib/storage/files';
import { getSupportContext } from '@/lib/data/support-items';
import { getMenteeSubmissionSummary } from '@/lib/data/mentee-progress';
import { queueNotification } from '@/lib/workflow/notifications';
import { encodeContractorSigner, MAX_SUPPORT_ITEMS } from '@/lib/support/catalog';

export type SupportResult = { ok: true } | { ok: false; error: string };

/** 지원신청/자금신청 화면 관련 경로 재검증 (멘티·멘토 대리 양쪽) */
function revalidateSupport(caseId: string): void {
  revalidatePath('/mentee/dashboard');
  revalidatePath('/mentee/pre-support');
  revalidatePath('/mentee/post-support');
  revalidatePath('/mentee/contractor-signatures');
  revalidatePath(`/mentor/cases/${caseId}/pre-support`);
  revalidatePath(`/mentor/cases/${caseId}/post-support`);
  revalidatePath(`/mentor/cases/${caseId}/contractor-signatures`);
}

function missingText(missing: string[]): string {
  const head = missing.slice(0, 3).join(', ');
  return missing.length > 3 ? `${head} 외 ${missing.length - 3}건` : head;
}

/**
 * 지원신청(사전) 제출 — 신청단위 필수서류 충족 검증 후 제출 확정.
 * log_completed 단계면 contractor_registered 로 전이하고 담당 멘토에게 지원신청서 작성 안내.
 * (이미 지난 단계면 제출시각만 갱신)
 */
export async function submitPreSupportAction(caseId: string): Promise<SupportResult> {
  const ctx = await getSupportContext(caseId);
  if (!ctx || !ctx.editable) return { ok: false, error: '권한이 없습니다.' };

  const summary = await getMenteeSubmissionSummary(caseId);
  if (!summary.pre.hasUnits) {
    return { ok: false, error: '신청단위(공사업체)를 1개 이상 추가하고 서류를 올려 주세요.' };
  }
  if (summary.pre.missing.length > 0) {
    return { ok: false, error: `부족한 서류가 있습니다: ${missingText(summary.pre.missing)}` };
  }

  const admin = createAdminClient();
  const { data: caseRow } = await admin
    .from('cases')
    .select('status')
    .eq('id', caseId)
    .maybeSingle();
  await admin
    .from('cases')
    .update({ pre_support_submitted_at: new Date().toISOString() })
    .eq('id', caseId);

  if (caseRow?.status === 'log_completed') {
    const { data: updated } = await admin
      .from('cases')
      .update({ status: 'contractor_registered' })
      .eq('id', caseId)
      .eq('status', 'log_completed')
      .select('id');
    if (updated && updated.length > 0) {
      await admin.from('case_status_history').insert({
        case_id: caseId,
        from_status: 'log_completed',
        to_status: 'contractor_registered',
        changed_by: ctx.actorId,
        note: '지원신청(사전) 서류 제출',
      });
      const { data: assign } = await admin
        .from('mentor_assignments')
        .select('mentor_id')
        .eq('case_id', caseId)
        .eq('is_active', true)
        .maybeSingle();
      if (assign) {
        await queueNotification(admin, {
          caseId,
          recipientId: assign.mentor_id,
          triggerEvent: 'contractor_registered',
        });
      }
    }
  }

  await admin.from('audit_logs').insert({
    actor_id: ctx.actorId,
    action: 'support.pre_submitted',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { by_role: ctx.role },
  });

  revalidateSupport(caseId);
  return { ok: true };
}

/**
 * 자금신청(사후) 제출 — 지급증빙 필수서류 충족 검증 후 제출 확정.
 * notified 단계면 execution_docs_submitted 로 전이하고 넥스트랩에 알림.
 */
export async function submitPostSupportAction(caseId: string): Promise<SupportResult> {
  const ctx = await getSupportContext(caseId);
  if (!ctx || !ctx.editable) return { ok: false, error: '권한이 없습니다.' };

  const summary = await getMenteeSubmissionSummary(caseId);
  if (summary.post.missing.length > 0) {
    return { ok: false, error: `부족한 서류가 있습니다: ${missingText(summary.post.missing)}` };
  }

  const admin = createAdminClient();
  const { data: caseRow } = await admin
    .from('cases')
    .select('status')
    .eq('id', caseId)
    .maybeSingle();
  await admin
    .from('cases')
    .update({ post_support_submitted_at: new Date().toISOString() })
    .eq('id', caseId);

  if (caseRow?.status === 'notified') {
    const { data: updated } = await admin
      .from('cases')
      .update({ status: 'execution_docs_submitted' })
      .eq('id', caseId)
      .eq('status', 'notified')
      .select('id');
    if (updated && updated.length > 0) {
      await admin.from('case_status_history').insert({
        case_id: caseId,
        from_status: 'notified',
        to_status: 'execution_docs_submitted',
        changed_by: ctx.actorId,
        note: '자금신청(사후) 증빙 제출',
      });
      const { data: nextlabs } = await admin.from('users').select('id').eq('role', 'nextlab');
      for (const u of nextlabs ?? []) {
        await queueNotification(admin, {
          caseId,
          recipientId: u.id,
          triggerEvent: 'execution_docs_submitted',
        });
      }
    }
  }

  await admin.from('audit_logs').insert({
    actor_id: ctx.actorId,
    action: 'support.post_submitted',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { by_role: ctx.role },
  });

  revalidateSupport(caseId);
  return { ok: true };
}

function toAmount(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export interface SupportItemInput {
  caseId: string;
  id?: string;
  companyName: string;
  representative: string;
  businessRegNo: string;
  phone: string;
  workType: string;
  estimateAmount: string;
}

/** 신청단위(공사업체) 추가/수정. 최대 3개. 멘티 본인·담당 멘토만. */
export async function saveSupportItemAction(input: SupportItemInput): Promise<SupportResult> {
  const ctx = await getSupportContext(input.caseId);
  if (!ctx || !ctx.editable) return { ok: false, error: '권한이 없습니다.' };

  const companyName = input.companyName.trim();
  if (!companyName) return { ok: false, error: '업체명을 입력하세요.' };

  const admin = createAdminClient();
  const payload = {
    company_name: companyName,
    representative: input.representative.trim() || null,
    business_reg_no: input.businessRegNo.trim() || null,
    phone: input.phone.trim() || null,
    work_type: input.workType.trim() || null,
    estimate_amount: toAmount(input.estimateAmount),
  };

  if (input.id) {
    const { error } = await admin
      .from('contractors')
      .update(payload)
      .eq('id', input.id)
      .eq('case_id', input.caseId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { count } = await admin
      .from('contractors')
      .select('id', { count: 'exact', head: true })
      .eq('case_id', input.caseId);
    if ((count ?? 0) >= MAX_SUPPORT_ITEMS) {
      return { ok: false, error: `신청단위는 최대 ${MAX_SUPPORT_ITEMS}개까지 등록할 수 있습니다.` };
    }
    const { error } = await admin
      .from('contractors')
      .insert({ case_id: input.caseId, ...payload });
    if (error) return { ok: false, error: error.message };
  }

  await admin.from('audit_logs').insert({
    actor_id: ctx.actorId,
    action: input.id ? 'support_item.update' : 'support_item.create',
    entity_type: 'contractors',
    entity_id: input.caseId,
    metadata: { by_role: ctx.role },
  });

  revalidateSupport(input.caseId);
  return { ok: true };
}

/** 신청단위 삭제 (연결된 si:* 서류도 정리) */
export async function deleteSupportItemAction(
  caseId: string,
  contractorId: string,
): Promise<SupportResult> {
  const ctx = await getSupportContext(caseId);
  if (!ctx || !ctx.editable) return { ok: false, error: '권한이 없습니다.' };

  const admin = createAdminClient();
  // 연결 서류(스토리지 + 행) 정리
  const { data: docs } = await admin
    .from('documents')
    .select('id, storage_path')
    .eq('case_id', caseId)
    .like('doc_key', `si:${contractorId}:%`);
  const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean) as string[];
  if (paths.length) await admin.storage.from('documents').remove(paths);
  if ((docs ?? []).length) {
    await admin
      .from('documents')
      .delete()
      .eq('case_id', caseId)
      .like('doc_key', `si:${contractorId}:%`);
  }

  const { error } = await admin
    .from('contractors')
    .delete()
    .eq('id', contractorId)
    .eq('case_id', caseId);
  if (error) return { ok: false, error: error.message };

  revalidateSupport(caseId);
  return { ok: true };
}

export interface SupportDocStaging {
  stagingPath: string;
  fileName: string;
  mimeType: string;
}

/**
 * 지원/자금 서류 첨부. 브라우저가 스테이징에 올린 파일을 케이스 폴더로 이관하고 documents 에 첨부.
 *  - 신청단위 서류: docKey = si:{contractorId}:{docType}
 *  - 지급증빙: docKey = post:{docType}
 * 해시·크기는 서버가 스테이징 파일을 내려받아 계산한다.
 */
export async function attachSupportDocAction(
  caseId: string,
  docKey: string,
  docName: string,
  staging: SupportDocStaging,
): Promise<SupportResult> {
  const ctx = await getSupportContext(caseId);
  if (!ctx || !ctx.editable) return { ok: false, error: '권한이 없습니다.' };
  if (!docKey.startsWith('si:') && !docKey.startsWith('post:')) {
    return { ok: false, error: '잘못된 서류 항목입니다.' };
  }
  if (!staging.stagingPath.startsWith('_staging/') || staging.stagingPath.includes('..')) {
    return { ok: false, error: '잘못된 업로드 경로입니다.' };
  }
  const basename = staging.stagingPath.split('/').pop();
  if (!basename) return { ok: false, error: '잘못된 업로드 경로입니다.' };

  const admin = createAdminClient();
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

  const { error: insertError } = await admin.from('documents').insert({
    case_id: caseId,
    doc_key: docKey,
    doc_name: docName || staging.fileName || '첨부파일',
    storage_path: dest,
    sha256: sha256Hex(buffer),
    uploaded_by: ctx.actorId,
    file_size: buffer.byteLength,
    mime_type: staging.mimeType || 'application/octet-stream',
  });
  if (insertError) return { ok: false, error: insertError.message };

  revalidateSupport(caseId);
  return { ok: true };
}

/** 첨부 서류 삭제 (스토리지 + 행). 해당 케이스 소속만. */
export async function deleteSupportDocAction(
  caseId: string,
  docId: string,
): Promise<SupportResult> {
  const ctx = await getSupportContext(caseId);
  if (!ctx || !ctx.editable) return { ok: false, error: '권한이 없습니다.' };

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('documents')
    .select('storage_path, doc_key')
    .eq('id', docId)
    .eq('case_id', caseId)
    .maybeSingle();
  if (!doc) return { ok: false, error: '서류를 찾을 수 없습니다.' };
  if (!doc.doc_key || (!doc.doc_key.startsWith('si:') && !doc.doc_key.startsWith('post:'))) {
    return { ok: false, error: '이 항목은 삭제할 수 없습니다.' };
  }
  if (doc.storage_path) await admin.storage.from('documents').remove([doc.storage_path]);
  await admin.from('documents').delete().eq('id', docId).eq('case_id', caseId);

  revalidateSupport(caseId);
  return { ok: true };
}

/**
 * 첨부 서류 열람/다운로드용 signed URL (팝업·다운로드). 케이스 폴더 범위 검증.
 * 멘티·멘토뿐 아니라 운영진(넥스트랩·진흥원)도 열람/다운로드할 수 있다(getSupportContext 가 ctx 반환).
 */
export async function getSupportDocUrl(
  caseId: string,
  docId: string,
  download = false,
): Promise<string | null> {
  const ctx = await getSupportContext(caseId);
  if (!ctx) return null;
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('documents')
    .select('storage_path, doc_name')
    .eq('id', docId)
    .eq('case_id', caseId)
    .maybeSingle();
  if (!doc?.storage_path) return null;
  return createCaseScopedSignedUrl(
    'documents',
    caseId,
    doc.storage_path,
    300,
    download ? doc.doc_name || true : false,
  );
}

/** 공사업체 서명 이미지 열람/다운로드용 signed URL (signatures 버킷). 관계자·운영진 접근. */
export async function getContractorSignatureUrl(
  caseId: string,
  signatureId: string,
  download = false,
): Promise<string | null> {
  const ctx = await getSupportContext(caseId);
  if (!ctx) return null;
  const admin = createAdminClient();
  const { data: sig } = await admin
    .from('signatures')
    .select('storage_path, document_type')
    .eq('id', signatureId)
    .eq('case_id', caseId)
    .maybeSingle();
  if (!sig?.storage_path || sig.document_type !== 'contractor_sign') return null;
  return createCaseScopedSignedUrl('signatures', caseId, sig.storage_path, 300, download);
}

/** 공사업체 서명 추가 (납품업체명·대표명·서명 이미지) */
export async function addContractorSignatureAction(
  caseId: string,
  companyName: string,
  representative: string,
  signatureDataUrl: string,
): Promise<SupportResult> {
  const ctx = await getSupportContext(caseId);
  if (!ctx || !ctx.editable) return { ok: false, error: '권한이 없습니다.' };

  const company = companyName.trim();
  const rep = representative.trim();
  if (!company) return { ok: false, error: '납품업체명을 입력하세요.' };
  if (!rep) return { ok: false, error: '대표명을 입력하세요.' };

  const parsed = dataUrlToBuffer(signatureDataUrl);
  if (!parsed) return { ok: false, error: '서명을 입력하세요.' };

  const admin = createAdminClient();
  try {
    const meta = await uploadFile('signatures', caseId, parsed.buffer, parsed.mimeType, 'png');
    const { error } = await admin.from('signatures').insert({
      case_id: caseId,
      signer_type: 'contractor',
      signer_name: encodeContractorSigner(company, rep),
      document_type: 'contractor_sign',
      storage_path: meta.storagePath,
      sha256: meta.sha256,
    });
    if (error) return { ok: false, error: error.message };
  } catch {
    return { ok: false, error: '서명 저장에 실패했습니다. 다시 시도하세요.' };
  }

  await admin.from('audit_logs').insert({
    actor_id: ctx.actorId,
    action: 'contractor.signature',
    entity_type: 'signatures',
    entity_id: caseId,
    metadata: { by_role: ctx.role },
  });

  revalidateSupport(caseId);
  return { ok: true };
}

/**
 * 공사업체 서명 재서명(수정·재업로드).
 * 새 서명을 먼저 저장한 뒤 기존 서명을 삭제한다(중간 실패 시 원본 유지 → 데이터 유실 방지).
 */
export async function replaceContractorSignatureAction(
  caseId: string,
  oldSignatureId: string,
  companyName: string,
  representative: string,
  signatureDataUrl: string,
): Promise<SupportResult> {
  const added = await addContractorSignatureAction(
    caseId,
    companyName,
    representative,
    signatureDataUrl,
  );
  if (!added.ok) return added;
  // 새 서명 저장 성공 후 기존 서명 삭제 (실패해도 새 서명은 유지)
  await deleteContractorSignatureAction(caseId, oldSignatureId);
  revalidateSupport(caseId);
  return { ok: true };
}

/** 공사업체 서명 삭제 */
export async function deleteContractorSignatureAction(
  caseId: string,
  signatureId: string,
): Promise<SupportResult> {
  const ctx = await getSupportContext(caseId);
  if (!ctx || !ctx.editable) return { ok: false, error: '권한이 없습니다.' };

  const admin = createAdminClient();
  const { data: sig } = await admin
    .from('signatures')
    .select('storage_path, document_type')
    .eq('id', signatureId)
    .eq('case_id', caseId)
    .maybeSingle();
  if (!sig || sig.document_type !== 'contractor_sign') {
    return { ok: false, error: '서명을 찾을 수 없습니다.' };
  }
  if (sig.storage_path) await admin.storage.from('signatures').remove([sig.storage_path]);
  await admin.from('signatures').delete().eq('id', signatureId).eq('case_id', caseId);

  revalidateSupport(caseId);
  return { ok: true };
}
