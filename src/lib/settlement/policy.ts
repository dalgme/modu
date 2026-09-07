import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { policyFromParams, type WithholdingPolicy } from '@/lib/settlement/compute';

export type WithholdingMethod = WithholdingPolicy['method'];

export interface ResolvedWithholding {
  policy: WithholdingPolicy;
  /** 어느 층에서 결정됐는지 (감사·화면 표시용) */
  source: 'mentor_in_group' | 'group' | 'program';
}

/**
 * 원천징수 방식 결정 순서 (docs/MODU-DESIGN.md §6-2, 3차 답변):
 *   ① 그룹 안의 멘토별 설정(support_type_members.withholding_method)
 *   ② 그룹 일괄 설정(support_types.withholding_method)
 *   ③ 행사 기본(programs.default_withholding_method)
 * 파라미터(세율 등)는 행사 설정 programs.withholding_params 에서 방식별로 읽는다.
 */
export async function resolveWithholding(programId: string, supportTypeId: string | null, mentorId: string): Promise<ResolvedWithholding> {
  const admin = createAdminClient();
  const [{ data: program }, { data: group }, { data: member }] = await Promise.all([
    admin.from('programs').select('default_withholding_method, withholding_params').eq('id', programId).maybeSingle(),
    supportTypeId ? admin.from('support_types').select('withholding_method').eq('id', supportTypeId).maybeSingle() : Promise.resolve({ data: null }),
    supportTypeId
      ? admin.from('support_type_members').select('withholding_method').eq('support_type_id', supportTypeId).eq('user_id', mentorId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!program) throw new Error('행사를 찾을 수 없습니다.');

  let method: WithholdingMethod;
  let source: ResolvedWithholding['source'];
  if (member?.withholding_method) {
    method = member.withholding_method as WithholdingMethod;
    source = 'mentor_in_group';
  } else if (group?.withholding_method) {
    method = group.withholding_method as WithholdingMethod;
    source = 'group';
  } else {
    method = program.default_withholding_method as WithholdingMethod;
    source = 'program';
  }
  return { policy: policyFromParams(method, program.withholding_params), source };
}
