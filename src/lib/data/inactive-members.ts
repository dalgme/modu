import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';

/**
 * 이 행사에서 비활성인 회원 id (2026-10-01) — [이 행사에서 비활성화](program_members.is_active=false)
 * 또는 [계정 잠금](users.is_active=false). 회원 명단 [비활성화] 탭과 같은 기준(isRosterActive 의 반대).
 * 운영사 대시보드의 배정 대기·지연 케이스·핵심 지표에서 이 회원(멘티)의 케이스를 뺄 때 쓴다.
 */
export async function loadInactiveMemberIds(programId: string, role?: 'mentee' | 'mentor'): Promise<Set<string>> {
  const admin = createAdminClient();
  let q = admin.from('program_members').select('user_id, is_active').eq('program_id', programId);
  if (role) q = q.eq('role', role);
  const { data, error } = await q;
  if (error) {
    console.error('loadInactiveMemberIds failed:', error.message);
    return new Set();
  }
  const rows = data ?? [];
  const out = new Set(rows.filter((r) => !r.is_active).map((r) => r.user_id));
  const activeIds = rows.filter((r) => r.is_active).map((r) => r.user_id);
  const locked = await fetchAllIn<{ id: string }>(activeIds, (chunk, from, to) => admin.from('users').select('id').in('id', chunk).eq('is_active', false).range(from, to));
  for (const u of locked) out.add(u.id);
  return out;
}
