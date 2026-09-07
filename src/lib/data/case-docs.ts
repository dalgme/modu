import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createCaseScopedSignedUrl } from '@/lib/storage/files';
import { isWebPreviewable } from '@/lib/utils/file-type';

export interface CaseDocFile {
  id: string;
  name: string;
  url: string | null;
  downloadUrl: string | null;
  createdAt: string;
  /** 웹 미리보기(인라인 렌더) 가능 여부. PDF·이미지만 true. */
  previewable: boolean;
  /** 문서 키(doc_key). 업체별 그룹핑 등에 사용. */
  docKey: string | null;
}

async function toFiles(
  caseId: string,
  rows: {
    id: string;
    doc_name: string;
    storage_path: string;
    created_at: string;
    mime_type?: string | null;
    doc_key?: string | null;
  }[],
): Promise<CaseDocFile[]> {
  const [views, downloads] = await Promise.all([
    Promise.all(rows.map((d) => createCaseScopedSignedUrl('documents', caseId, d.storage_path, 600))),
    Promise.all(
      rows.map((d) =>
        createCaseScopedSignedUrl('documents', caseId, d.storage_path, 600, d.doc_name || true),
      ),
    ),
  ]);
  return rows.map((d, i) => ({
    id: d.id,
    name: d.doc_name ?? '첨부파일',
    url: views[i] ?? null,
    downloadUrl: downloads[i] ?? null,
    createdAt: d.created_at,
    previewable: isWebPreviewable(d.mime_type, d.storage_path),
    docKey: d.doc_key ?? null,
  }));
}

/** 특정 doc_key 의 케이스 서류(스토리지 파일 + 행) 모두 삭제. 상호배타 교체용. */
export async function deleteCaseDocsByKey(caseId: string, docKey: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('documents')
    .select('id, storage_path')
    .eq('case_id', caseId)
    .eq('doc_key', docKey);
  const rows = data ?? [];
  if (rows.length === 0) return;
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p);
  if (paths.length) await admin.storage.from('documents').remove(paths);
  await admin.from('documents').delete().eq('case_id', caseId).eq('doc_key', docKey);
}

/** 특정 doc_key 의 케이스 서류 목록 (열람·다운로드 signed URL 포함) */
export async function listCaseDocsByKey(caseId: string, docKey: string): Promise<CaseDocFile[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('documents')
    .select('id, doc_name, storage_path, created_at, mime_type, doc_key')
    .eq('case_id', caseId)
    .eq('doc_key', docKey)
    .order('created_at', { ascending: true });
  return toFiles(caseId, data ?? []);
}

/** 여러 doc_key 를 한 번에 조회해 doc_key 별로 묶어 반환 */
export async function listCaseDocsByKeys(
  caseId: string,
  docKeys: string[],
): Promise<Map<string, CaseDocFile[]>> {
  const byKey = new Map<string, CaseDocFile[]>();
  if (docKeys.length === 0) return byKey;
  const admin = createAdminClient();
  const { data } = await admin
    .from('documents')
    .select('id, doc_key, doc_name, storage_path, created_at, mime_type')
    .eq('case_id', caseId)
    .in('doc_key', docKeys)
    .order('created_at', { ascending: true });
  const rows = data ?? [];
  const files = await toFiles(caseId, rows);
  rows.forEach((r, i) => {
    if (!r.doc_key) return;
    const arr = byKey.get(r.doc_key);
    const f = files[i]!;
    if (arr) arr.push(f);
    else byKey.set(r.doc_key, [f]);
  });
  return byKey;
}

/** doc_key 접두 일치(예: 'contractor_')로 케이스 서류 목록 조회 */
export async function listCaseDocsByPrefix(caseId: string, prefix: string): Promise<CaseDocFile[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('documents')
    .select('id, doc_name, storage_path, created_at, mime_type, doc_key')
    .eq('case_id', caseId)
    .like('doc_key', `${prefix}%`)
    .order('created_at', { ascending: true });
  return toFiles(caseId, data ?? []);
}
