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
  /** 그룹 필수서류 슬롯 키(`req:` / `req1:`). 없으면 자유 첨부 `case_doc`. */
  docKey?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { stagingPath } = input.staging;
  const docKey = input.docKey ?? CASE_DOC_KEY;
  if (docKey !== CASE_DOC_KEY && !isRequiredDocKey(docKey)) return { ok: false, error: '허용되지 않는 서류 키입니다.' };
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
  // 단일본(req1:) — delete-then-insert. DB 유니크 인덱스(0052)가 최종 방어선.
  if (docKey.startsWith('req1:')) {
    const { data: old } = await admin.from('documents').select('id, storage_path').eq('case_id', input.caseId).eq('doc_key', docKey);
    for (const d of old ?? []) if (d.storage_path !== dest) await admin.storage.from('documents').remove([d.storage_path]);
    if ((old ?? []).length > 0) await admin.from('documents').delete().in('id', (old ?? []).map((d) => d.id));
  }
  const { error } = await admin.from('documents').insert({
    case_id: input.caseId,
    doc_key: docKey,
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
    metadata: { doc_key: docKey, mentor_visible: mentorVisible, name: input.staging.fileName },
  });
  return { ok: true };
}

/** 공개 범위 변경 (운영사·멘티) */
export async function setCaseDocumentVisibility(docId: string, caseId: string, actorId: string, mentorVisible: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { error } = await admin.from('documents').update({ mentor_visible: mentorVisible }).eq('id', docId).eq('case_id', caseId).or(`doc_key.eq.${CASE_DOC_KEY},doc_key.like.req%`);
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({ actor_id: actorId, action: 'document.visibility', entity_type: 'documents', entity_id: docId, metadata: { mentor_visible: mentorVisible } });
  return { ok: true };
}

export async function deleteCaseDocument(docId: string, caseId: string, actor: Pick<Tables<'users'>, 'id' | 'role'>): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: doc } = await admin.from('documents').select('id, storage_path, uploaded_by').eq('id', docId).eq('case_id', caseId).or(`doc_key.eq.${CASE_DOC_KEY},doc_key.like.req%`).maybeSingle();
  if (!doc) return { ok: false, error: '파일을 찾을 수 없습니다.' };
  if (actor.role !== 'nextlab' && doc.uploaded_by !== actor.id) return { ok: false, error: '본인이 올린 파일만 삭제할 수 있습니다.' };
  await admin.storage.from('documents').remove([doc.storage_path]);
  await admin.from('documents').delete().eq('id', docId);
  await admin.from('audit_logs').insert({ actor_id: actor.id, action: 'document.delete', entity_type: 'documents', entity_id: docId, metadata: { case_id: caseId } });
  return { ok: true };
}

/** 그룹 필수서류 키 (docs §5-3): `req:{key}` 복수 허용 / `req1:{key}` 단일본(유니크 인덱스) */
export function isRequiredDocKey(key: string): boolean {
  return /^req1?:[A-Za-z0-9_\-]+$/.test(key);
}

export interface RequiredDocSlot {
  key: string; // req:… / req1:…
  name: string;
  required: boolean;
  multiple: boolean;
  condition: string | null;
  forRole: 'mentee' | 'mentor' | 'staff';
  files: CaseDocItem[];
}

/** 케이스 그룹의 필수서류 슬롯 + 업로드 현황 (RLS 조회 → 멘토는 비공개본 제외) */
export async function listRequiredDocSlots(caseId: string, viewerRole: UserRole): Promise<RequiredDocSlot[]> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('support_type_id').eq('id', caseId).maybeSingle();
  if (!c) return [];
  const { data: defs } = await admin
    .from('support_type_documents')
    .select('doc_key, doc_name, is_required, multiple, condition, for_role, sort_order')
    .eq('support_type_id', c.support_type_id)
    .order('sort_order');
  const slots = (defs ?? []).map((d) => ({ key: `${d.multiple ? 'req' : 'req1'}:${d.doc_key}`, def: d }));
  if (slots.length === 0) return [];
  const supabase = createClient();
  const { data: docs } = await supabase
    .from('documents')
    .select('id, doc_key, doc_name, storage_path, mentor_visible, uploaded_role, uploaded_by, created_at, file_size')
    .eq('case_id', caseId)
    .in('doc_key', slots.map((s) => s.key))
    .order('created_at', { ascending: false });
  const visible = (docs ?? []).filter((d) => viewerRole !== 'mentor' || d.mentor_visible);
  const out: RequiredDocSlot[] = [];
  for (const s of slots) {
    const files = await Promise.all(
      visible
        .filter((d) => d.doc_key === s.key)
        .map(async (d) => ({
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
    out.push({ key: s.key, name: s.def.doc_name, required: s.def.is_required, multiple: s.def.multiple, condition: s.def.condition, forRole: s.def.for_role as RequiredDocSlot['forRole'], files });
  }
  return out;
}

/** 종결 게이트용: 멘티 필수서류(is_required, for_role=mentee) 중 누락된 이름 목록 (service_role) */
export async function missingRequiredMenteeDocs(caseId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('support_type_id').eq('id', caseId).maybeSingle();
  if (!c) return [];
  const { data: defs } = await admin.from('support_type_documents').select('doc_key, doc_name, multiple').eq('support_type_id', c.support_type_id).eq('is_required', true).eq('for_role', 'mentee');
  if (!defs || defs.length === 0) return [];
  const keys = defs.map((d) => `${d.multiple ? 'req' : 'req1'}:${d.doc_key}`);
  const { data: docs } = await admin.from('documents').select('doc_key').eq('case_id', caseId).in('doc_key', keys);
  const have = new Set((docs ?? []).map((d) => d.doc_key));
  return defs.filter((d) => !have.has(`${d.multiple ? 'req' : 'req1'}:${d.doc_key}`)).map((d) => d.doc_name);
}
