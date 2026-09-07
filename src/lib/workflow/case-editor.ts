import 'server-only';

import { getSessionProfile, getRealSessionProfile } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasActiveEditGrant } from '@/lib/data/edit-grants';

/**
 * 이 케이스의 서류를 '지금' 편집할 수 있는 주체를 확인한다.
 *  - 담당 활성 멘토(대행 중이면 대행 대상 멘토): 항상 — 편집 규칙은 각 액션의 상태 게이트가 담당
 *  - 넥스트랩이 '자기 명의로' 편집: 활성 임시 수정권한(edit grant)이 열려 있을 때만
 *
 * 대행 경로는 멘토 분기로 열리고, 넥스트랩 자기 명의 경로는 종전대로 edit-grant 로만 열린다.
 * (edit-grant 조건을 제거하면 승인·완료 케이스 서류가 사후에 조용히 교체될 수 있다)
 */
export async function resolveCaseDocEditor(caseId: string): Promise<{ id: string } | null> {
  const profile = await getSessionProfile();
  const real = await getRealSessionProfile();
  if (!profile || !profile.is_active) return null;
  const admin = createAdminClient();

  if (profile.role === 'mentor') {
    const { data } = await admin
      .from('mentor_assignments')
      .select('id')
      .eq('case_id', caseId)
      .eq('mentor_id', profile.id)
      .eq('is_active', true)
      .maybeSingle();
    if (data) return { id: profile.id };
  }
  if (real?.role === 'nextlab' && real.is_active) {
    return (await hasActiveEditGrant(caseId)) ? { id: real.id } : null;
  }
  return null;
}
