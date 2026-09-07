import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createCaseScopedSignedUrl } from '@/lib/storage/files';

/** 첨부된 '지원신청서 완성본' 파일 (생성 PDF=support_application 과 구분) */
export const APPLICATION_FILE_DOC_KEY = 'support_application_file';

export interface AttachedFile {
  id: string;
  name: string;
  url: string | null;
  createdAt: string;
}

/** 첨부된 지원신청서 완성본 파일 목록 (열람용 signed URL 포함) */
export async function listApplicationFiles(caseId: string): Promise<AttachedFile[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('documents')
    .select('id, doc_name, storage_path, created_at')
    .eq('case_id', caseId)
    .eq('doc_key', APPLICATION_FILE_DOC_KEY)
    .order('created_at', { ascending: true });
  const rows = data ?? [];
  const urls = await Promise.all(
    rows.map((d) => createCaseScopedSignedUrl('documents', caseId, d.storage_path, 600)),
  );
  return rows.map((d, i) => ({
    id: d.id,
    name: d.doc_name ?? '지원신청서',
    url: urls[i] ?? null,
    createdAt: d.created_at,
  }));
}
