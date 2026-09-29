import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { parseFilePolicy, type FilePolicy } from '@/lib/files/business-plan-shared';

/** 행사 파일 보안 정책 읽기 (programs.file_policy) — 멘티 사업계획서 다운로드 허용 여부 등 */
export async function readFilePolicy(programId: string): Promise<FilePolicy> {
  const { data } = await createAdminClient().from('programs').select('file_policy').eq('id', programId).maybeSingle();
  return parseFilePolicy(data?.file_policy);
}
