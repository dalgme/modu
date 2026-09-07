import { createClient } from '@/lib/supabase/server';

export interface FormStatus {
  /** 최종 생성일 (ISO) */
  lastGeneratedAt: string;
  /** 생성 횟수 (2 이상이면 재생성됨) */
  count: number;
}

/**
 * 케이스의 붙임서식(doc_key=form_*) 생성 상태.
 * templateKey → { 최종생성일, 생성횟수 }. 없으면 미생성.
 */
export async function getCaseFormStatus(caseId: string): Promise<Record<string, FormStatus>> {
  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('doc_key, created_at')
    .eq('case_id', caseId)
    .like('doc_key', 'form_%')
    .order('created_at', { ascending: false });

  const map: Record<string, FormStatus> = {};
  for (const d of data ?? []) {
    if (!d.doc_key) continue;
    const key = d.doc_key.replace(/^form_/, '');
    const cur = map[key];
    if (!cur) map[key] = { lastGeneratedAt: d.created_at, count: 1 };
    else cur.count += 1;
  }
  return map;
}
