import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';

export type DocumentRow = Tables<'documents'>;

/** 케이스에 업로드된 서류 목록 */
export async function getCaseDocuments(caseId: string): Promise<DocumentRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/** doc_key 별 업로드 개수 맵 */
export async function getDocumentCountsByKey(caseId: string): Promise<Record<string, number>> {
  const docs = await getCaseDocuments(caseId);
  const counts: Record<string, number> = {};
  for (const d of docs) {
    if (d.doc_key) counts[d.doc_key] = (counts[d.doc_key] ?? 0) + 1;
  }
  return counts;
}
