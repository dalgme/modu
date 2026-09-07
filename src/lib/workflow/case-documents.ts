import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { createCaseScopedSignedUrl, moveFile, sha256Hex } from '@/lib/storage/files';
import type { Tables } from '@/types/database';
import type { UserRole } from '@/lib/auth/roles';

/**
 * 멘티 관련 서류 첨부 (2026-09-07 요건) — doc_key 'case_doc' 누적.
 * `mentor_visible=false`(비공개) 문서는 운영사·발주처·멘티만 보고 멘토에게는 노출되지 않는다(RLS + 코드).
 */
export const CASE_DOC_KEY = 'case_doc';

export interface CaseDocItem {
  id: string;
  name: string;
  url: string | null;
  mentorVisible: boolean;
  uploadedRole: UserRole | null;
  uploadedBy: string | null;
  createdAt: string;
  size: number | null;
}

/** 목록 — RLS 클라이언트로 조회하므로 멘토에게는 비공개본이 오지 않는다. 코드에서 한 번 더 거른다. */
export async function listCaseDocuments(caseId: string, viewerRole: UserRole): Promise<CaseDocItem[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('id, doc_name, storage_path, mentor_visible, uploaded_role, uploaded_by, created_at, file_size')
    .eq('case_id', caseId)
    .eq('doc_key', CASE_DOC_KEY)
    .order('created_at', { ascending: false });
  const rows = (data ?? []).filter((d) => viewerRole !== 'mentor' || d.mentor_visible);
  return Promise.all(
    rows.map(async (d) => ({
      id: d.id,
      name: d.doc_name,
      url: await createCaseScopedSignedUrl('documents', caseId, d.storage_path, 600, d.doc_name),
      mentorVisible: d.mentor_visible,
      uploadedRole: d.uploaded_role,
      uploadedBy: d.uploaded_by,
      createdAt: d.created_at,
      size: d.file_size,
    })),
  );
}

export async function attachCaseDocument(input: {
  caseId: string;
  actor: Pick<Tables<'users'>, 'id' | 'role'>;
  staging: { stagingPath: string; fileName: string; mimeType: string };
  label?: string;
  mentorVisible: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { stagingPath } = input.staging;
  if (!stagingPath.startsWith('_staging/') || stagingPath.includes('..')) return { ok: false, error: '잘못된 업로드 경로입니다.' };
  const admin = createAdminClient();
  const basename = stagingPath.split('/').pop();
  if (!basename) return { ok: false, error: '잘못된 업로드 경로입니다.' };
  const { data: blob } = await admin.storage.from('documents').download(stagingPath);
  if (!blob) return { ok: false, error: '업로드된 파일을 확인할 수 없습니다.' };
  const buffer = Buffer.from(await blob.arrayBuffer());
  const dest = `${input.caseId}/${basename}`;
  try {
    await moveFile('documents', stagingPath, dest);
  } catch {
    return { ok: false, error: '파일 이동에 실패했습니다.' };
  }
  // 멘토가 올린 파일은 항상 공개(자기 자신에게 숨길 이유가 없다)
  const mentorVisible = input.actor.role === 'mentor' ? true : input.mentorVisible;
  const { error } = await admin.from('documents').insert({
    case_id: input.caseId,
    doc_key: CASE_DOC_KEY,
    doc_name: (input.label?.trim() || input.staging.fileName || '첨부파일').slice(0, 120),
    storage_path: dest,
    sha256: sha256Hex(buffer),
    uploaded_by: input.actor.id,
    uploaded_role: input.actor.role,
    file_size: buffer.byteLength,
    mime_type: input.staging.mimeType || blob.type || 'application/octet-stream',
    mentor_visible: mentorVisible,
  });
  if (error) return { ok: false, error: error.message };
  const { data: c } = await admin.from('cases').select('program_id').eq('id', input.caseId).maybeSingle();
  await admin.from('audit_logs').insert({
    actor_id: input.actor.id,
    program_id: c?.program_id ?? null,
    action: 'document.attach',
    entity_type: 'cases',
    entity_id: input.caseId,
    metadata: { doc_key: CASE_DOC_KEY, mentor_visible: mentorVisible, name: input.staging.fileName },
  });
  return { ok: true };
}

/** 공개 범위 변경 (운영사·멘티) */
export async function setCaseDocumentVisibility(docId: string, caseId: string, actorId: string, mentorVisible: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { error } = await admin.from('documents').update({ mentor_visible: mentorVisible }).eq('id', docId).eq('case_id', caseId).eq('doc_key', CASE_DOC_KEY);
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({ actor_id: actorId, action: 'document.visibility', entity_type: 'documents', entity_id: docId, metadata: { mentor_visible: mentorVisible } });
  return { ok: true };
}

export async function deleteCaseDocument(docId: string, caseId: string, actor: Pick<Tables<'users'>, 'id' | 'role'>): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: doc } = await admin.from('documents').select('id, storage_path, uploaded_by').eq('id', docId).eq('case_id', caseId).eq('doc_key', CASE_DOC_KEY).maybeSingle();
  if (!doc) return { ok: false, error: '파일을 찾을 수 없습니다.' };
  if (actor.role !== 'nextlab' && doc.uploaded_by !== actor.id) return { ok: false, error: '본인이 올린 파일만 삭제할 수 있습니다.' };
  await admin.storage.from('documents').remove([doc.storage_path]);
  await admin.from('documents').delete().eq('id', docId);
  await admin.from('audit_logs').insert({ actor_id: actor.id, action: 'document.delete', entity_type: 'documents', entity_id: docId, metadata: { case_id: caseId } });
  return { ok: true };
}
