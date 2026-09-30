'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { getImpersonation } from '@/lib/auth/impersonation';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { moveFile, sha256Hex } from '@/lib/storage/files';
import { logAudit } from '@/lib/workflow/audit';
import { BUSINESS_DOC_KEYS, BUSINESS_DOC_LABELS, isBusinessDocKey, type BusinessDocKey } from '@/lib/files/business-plan-shared';
import { BUSINESS_DOC_MAX_BYTES, businessDocExtAllowed, businessDocExtLabel, matchMenteeFile } from '@/lib/files/business-plan-match';
import { loadRoundBusinessPlans } from '@/lib/files/business-plans';

/**
 * 멘티 사업계획서·참고파일 일괄 업로드·삭제 (2026-09-30) — 운영사 전용, 실명 기준·대행 불가, `case.manage` 권한.
 * 파일은 브라우저가 documents 버킷 `_staging/` 에 올린 뒤(stageUpload) 이 액션이 파일명 맨 앞의 멘티 이름으로
 * 현재 라운드의 케이스를 찾아 `{caseId}/…` 로 옮기고 documents 행을 만든다. 귀속되지 않은 파일은 저장하지 않는다.
 */

export type StagedBusinessFile = { stagingPath: string; fileName: string; mimeType: string };
export interface BusinessUploadItemResult {
  fileName: string;
  ok: boolean;
  caseId?: string;
  menteeName?: string;
  error?: string;
}
export type BusinessUploadResult = { ok: true; results: BusinessUploadItemResult[] } | { ok: false; error: string };
type SimpleResult = { ok: true } | { ok: false; error: string };

/** 한 번의 액션 호출로 처리하는 최대 파일 수 — 화면이 이 크기로 나눠 보낸다(60초 한도 안) */
const MAX_PER_CALL = 10;

async function operator(): Promise<{ id: string; programId: string; supportTypeId: string | null } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: '운영사 담당자만 실행할 수 있습니다.' };
  if (await getImpersonation()) return { error: '대행(화면 보기) 중에는 파일을 올리거나 지울 수 없습니다. 대행을 끝내고 다시 시도하세요.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.manage');
  if (denied) return { error: denied };
  return { id: profile.id, programId: ctx.programId, supportTypeId: ctx.supportTypeId };
}

async function removeStaged(paths: string[]) {
  const ok = paths.filter((p) => typeof p === 'string' && p.startsWith('_staging/') && !p.includes('..'));
  if (ok.length) await createAdminClient().storage.from('documents').remove(ok);
}

function revalidate(caseIds: string[]) {
  revalidatePath('/nextlab/files');
  for (const id of caseIds) {
    revalidatePath(`/nextlab/cases/${id}`);
    revalidatePath(`/mentor/cases/${id}`);
  }
}

/**
 * 일괄 업로드. caseId 를 주면 파일명 매칭 없이 그 멘티에 올린다(표의 행별 [업로드] — 이름 규칙을 못 지킨 파일용).
 * caseId 가 없으면 현재 라운드(범위 스위처의 그룹)가 선택되어 있어야 한다.
 */
export async function uploadBusinessDocsAction(input: { docKey: BusinessDocKey; files: StagedBusinessFile[]; caseId?: string | null }): Promise<BusinessUploadResult> {
  const files = Array.isArray(input.files) ? input.files : [];
  const staged = files.map((f) => f?.stagingPath).filter((p): p is string => typeof p === 'string');
  const bail = async (error: string): Promise<BusinessUploadResult> => {
    await removeStaged(staged);
    return { ok: false, error };
  };
  const op = await operator();
  if ('error' in op) return bail(op.error);
  if (!isBusinessDocKey(input.docKey)) return bail('서류 종류가 올바르지 않습니다.');
  if (files.length === 0) return { ok: false, error: '파일을 선택하세요.' };
  if (files.length > MAX_PER_CALL) return bail(`한 번에 ${MAX_PER_CALL}개까지 처리합니다.`);

  const admin = createAdminClient();
  // 귀속 대상: 행별 업로드면 그 케이스(이 행사·현재 라운드 확인), 아니면 라운드 전체 후보
  let fixed: { caseId: string; name: string } | null = null;
  let candidates: Awaited<ReturnType<typeof loadRoundBusinessPlans>>['candidates'] = [];
  if (input.caseId) {
    const { data: c } = await admin.from('cases').select('id, program_id, support_type_id, owner_name').eq('id', input.caseId).maybeSingle();
    if (!c || c.program_id !== op.programId || (op.supportTypeId && c.support_type_id !== op.supportTypeId)) return bail('이 라운드의 멘티가 아닙니다.');
    fixed = { caseId: c.id, name: c.owner_name };
  } else {
    if (!op.supportTypeId) return bail('상단 범위에서 라운드(사업그룹)를 먼저 선택하세요.');
    candidates = (await loadRoundBusinessPlans(op.programId, op.supportTypeId)).candidates;
  }

  const results: BusinessUploadItemResult[] = [];
  for (const f of files) {
    const fileName = (f?.fileName ?? '').normalize('NFC').trim().slice(0, 150) || '첨부파일';
    const reject = async (error: string) => {
      results.push({ fileName, ok: false, error });
      await removeStaged([f.stagingPath]);
    };
    if (!f?.stagingPath?.startsWith('_staging/') || f.stagingPath.includes('..')) {
      results.push({ fileName, ok: false, error: '잘못된 업로드 경로입니다.' });
      continue;
    }
    if (!businessDocExtAllowed(input.docKey, fileName)) {
      await reject(`${BUSINESS_DOC_LABELS[input.docKey]}는 ${businessDocExtLabel(input.docKey)} 형식만 올릴 수 있습니다.`);
      continue;
    }
    const target = fixed ?? (() => {
      const m = matchMenteeFile(fileName, candidates);
      return m.ok ? { caseId: m.caseId, name: m.name } : m.message;
    })();
    if (typeof target === 'string') {
      await reject(target);
      continue;
    }
    const { data: blob } = await admin.storage.from('documents').download(f.stagingPath);
    if (!blob) {
      results.push({ fileName, ok: false, error: '업로드된 파일을 확인할 수 없습니다.' });
      continue;
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (buffer.byteLength > BUSINESS_DOC_MAX_BYTES) {
      await reject('파일은 30MB 이하여야 합니다.');
      continue;
    }
    const basename = f.stagingPath.split('/').pop()!;
    const dest = `${target.caseId}/${basename}`;
    try {
      await moveFile('documents', f.stagingPath, dest);
    } catch {
      await reject('파일 이동에 실패했습니다.');
      continue;
    }
    const { error } = await admin.from('documents').insert({
      case_id: target.caseId,
      doc_key: input.docKey,
      doc_name: fileName,
      storage_path: dest,
      sha256: sha256Hex(buffer),
      uploaded_by: op.id,
      uploaded_role: 'nextlab',
      file_size: buffer.byteLength,
      mime_type: f.mimeType || blob.type || 'application/octet-stream',
      mentor_visible: true,
    });
    if (error) {
      await admin.storage.from('documents').remove([dest]);
      results.push({ fileName, ok: false, error: `저장 실패: ${error.message}` });
      continue;
    }
    results.push({ fileName, ok: true, caseId: target.caseId, menteeName: target.name });
  }

  const okRows = results.filter((r) => r.ok);
  const caseIds = Array.from(new Set(okRows.map((r) => r.caseId!)));
  await logAudit(admin, {
    actorId: op.id,
    programId: op.programId,
    action: 'files.business_plan_upload',
    entityType: input.caseId ? 'cases' : 'support_types',
    entityId: input.caseId ?? op.supportTypeId ?? undefined,
    metadata: {
      doc_key: input.docKey,
      uploaded: okRows.length,
      failed: results.length - okRows.length,
      case_ids: caseIds,
      ...(input.caseId ? { case_id: input.caseId } : {}),
    },
  });
  if (caseIds.length) revalidate(caseIds);
  return { ok: true, results };
}

/** 사업계획서·참고파일 한 건 삭제 (스토리지 파일 + 행) */
export async function deleteBusinessDocAction(docId: string): Promise<SimpleResult> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  // documents → cases 외래키가 둘(case_id·copied_from_case_id)이라 cases 임베드가 모호해 조회가 실패한다 — 따로 읽는다 (2026-09-30)
  const { data: doc, error: docErr } = await admin
    .from('documents')
    .select('id, case_id, doc_key, doc_name, storage_path')
    .eq('id', docId)
    .in('doc_key', [...BUSINESS_DOC_KEYS])
    .maybeSingle();
  if (docErr) console.error('deleteBusinessDocAction lookup failed:', docErr.message);
  const { data: owner } = doc?.case_id ? await admin.from('cases').select('program_id').eq('id', doc.case_id).maybeSingle() : { data: null };
  if (!doc || owner?.program_id !== op.programId) return { ok: false, error: '파일을 찾을 수 없습니다.' };
  const { error } = await admin.from('documents').delete().eq('id', doc.id);
  if (error) return { ok: false, error: `삭제 실패: ${error.message}` };
  // 케이스 폴더 안의 파일만 지운다(경로 조작 방지)
  if (doc.storage_path.startsWith(`${doc.case_id}/`)) await admin.storage.from('documents').remove([doc.storage_path]);
  await logAudit(admin, {
    actorId: op.id,
    programId: op.programId,
    action: 'files.business_plan_delete',
    entityType: 'documents',
    entityId: doc.id,
    metadata: { case_id: doc.case_id, doc_key: doc.doc_key, name: doc.doc_name },
  });
  revalidate([doc.case_id]);
  return { ok: true };
}
