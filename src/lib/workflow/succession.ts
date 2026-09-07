import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { assignMentor, createCase } from '@/lib/workflow/cases';

export interface SuccessionResult {
  created: { sourceCaseId: string; caseId: string; businessName: string; mentorAssigned: boolean }[];
  skipped: { sourceCaseId: string; businessName: string; reason: string }[];
}

/**
 * 그룹 간 승계 개설 (docs §8): 원천 케이스마다 대상 그룹에 **새 케이스**를 만들고 predecessor_case_id 로 연결한다.
 * 멘티 계정은 재발급하지 않고 mentee_id 를 그대로 연결. keepMentor 면 원천의 마지막 활성 멘토를 그대로 배정(T2).
 * 같은 프로그램 안에서만 가능(계정이 프로그램에 묶임).
 */
export async function succeedCases(input: { programId: string; actorId: string; sourceCaseIds: string[]; targetGroupId: string; keepMentor: boolean }): Promise<{ ok: true; result: SuccessionResult } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: target } = await admin.from('support_types').select('id, program_id, status, name').eq('id', input.targetGroupId).maybeSingle();
  if (!target || target.program_id !== input.programId) return { ok: false, error: '대상 그룹이 이 행사의 그룹이 아닙니다.' };
  if (target.status !== 'active') return { ok: false, error: '종료된 그룹으로는 승계할 수 없습니다.' };
  const ids = Array.from(new Set(input.sourceCaseIds));
  if (ids.length === 0) return { ok: false, error: '승계할 케이스를 선택하세요.' };
  const { data: sources } = await admin.from('cases').select('*').in('id', ids).eq('program_id', input.programId);
  if (!sources || sources.length !== ids.length) return { ok: false, error: '이 행사의 케이스가 아닌 항목이 있습니다.' };

  const result: SuccessionResult = { created: [], skipped: [] };
  for (const s of sources) {
    if (s.support_type_id === input.targetGroupId) {
      result.skipped.push({ sourceCaseId: s.id, businessName: s.business_name, reason: '이미 대상 그룹의 케이스' });
      continue;
    }
    const { data: dup } = await admin.from('cases').select('id').eq('support_type_id', input.targetGroupId).or(`predecessor_case_id.eq.${s.id}${s.mentee_id ? `,mentee_id.eq.${s.mentee_id}` : ''}`).limit(1);
    if (dup && dup.length > 0) {
      result.skipped.push({ sourceCaseId: s.id, businessName: s.business_name, reason: '대상 그룹에 이미 승계 케이스 있음' });
      continue;
    }
    const created = await createCase({
      programId: input.programId,
      createdBy: input.actorId,
      support_type_id: input.targetGroupId,
      business_name: s.business_name,
      owner_name: s.owner_name,
      phone: s.phone,
      email: s.email ?? undefined,
      business_reg_no: s.business_reg_no ?? undefined,
      address: s.address ?? undefined,
      business_type: s.business_type ?? undefined,
      item: s.item ?? undefined,
      opened_at: s.opened_at ?? undefined,
      employee_count: s.employee_count ?? undefined,
      predecessorCaseId: s.id,
      menteeId: s.mentee_id,
    });
    if (!created.ok) {
      result.skipped.push({ sourceCaseId: s.id, businessName: s.business_name, reason: created.error });
      continue;
    }
    // 프로필(태그) 복사 — 매칭 추천용
    const { data: prof } = await admin.from('mentee_profiles').select('*').eq('case_id', s.id).maybeSingle();
    if (prof) {
      const { case_id: _c, created_at: _ca, updated_at: _ua, ...rest } = prof;
      void _c; void _ca; void _ua;
      await admin.from('mentee_profiles').upsert({ ...rest, case_id: created.caseId }, { onConflict: 'case_id' });
    }
    let mentorAssigned = false;
    if (input.keepMentor) {
      const { data: assign } = await admin.from('mentor_assignments').select('mentor_id').eq('case_id', s.id).order('is_active', { ascending: false }).order('assigned_at', { ascending: false }).limit(1).maybeSingle();
      if (assign) {
        const r = await assignMentor(created.caseId, assign.mentor_id, input.actorId);
        mentorAssigned = r.ok;
      }
    }
    result.created.push({ sourceCaseId: s.id, caseId: created.caseId, businessName: s.business_name, mentorAssigned });
  }
  await admin.from('audit_logs').insert({ actor_id: input.actorId, program_id: input.programId, action: 'case.succession', entity_type: 'support_types', entity_id: input.targetGroupId, metadata: { created: result.created.length, skipped: result.skipped.length, keep_mentor: input.keepMentor } });
  return { ok: true, result };
}
