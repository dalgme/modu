import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { queueNotification } from '@/lib/workflow/notifications';
import { inviteMentee } from '@/lib/auth/admin-accounts';
import { toStoredPhone } from '@/lib/auth/identifier';
import { assertTransition, assignTarget, TRANSITIONS } from '@/lib/workflow/transitions';
import type { CaseFormInput } from '@/lib/validations/case';
import type { TablesInsert } from '@/types/database';

export type WorkflowResult = { ok: true; caseId: string } | { ok: false; error: string };

export interface CreateCaseInput extends CaseFormInput {
  programId: string;
  createdBy: string;
  /** 승계 개설 시 이전 단계 케이스 */
  predecessorCaseId?: string | null;
  /** 이미 계정이 있는 멘티를 연결할 때 (승계) — 없으면 휴대폰으로 계정 자동 발급 */
  menteeId?: string | null;
}

export type CreateCaseResult =
  | { ok: true; caseId: string; menteeCredential?: { email: string; tempPassword: string } }
  | { ok: false; error: string };

/**
 * T1 멘티(케이스) 등록 — status=registered. 운영사 전용(호출부 가드).
 * 사업그룹은 반드시 같은 행사 소속이어야 한다(DB 트리거도 검사).
 * 멘티 계정이 없으면 휴대폰 번호로 자동 발급하고, 행사 멤버십을 붙인다.
 */
export async function createCase(input: CreateCaseInput): Promise<CreateCaseResult> {
  const admin = createAdminClient();

  const { data: group } = await admin
    .from('support_types')
    .select('id, program_id, status')
    .eq('id', input.support_type_id)
    .maybeSingle();
  if (!group || group.program_id !== input.programId) {
    return { ok: false, error: '이 행사의 사업그룹이 아닙니다.' };
  }
  if (group.status !== 'active') return { ok: false, error: '종료된 사업그룹에는 등록할 수 없습니다.' };

  const storedPhone = toStoredPhone(input.phone) ?? input.phone;
  const insert: TablesInsert<'cases'> = {
    program_id: input.programId,
    support_type_id: input.support_type_id,
    created_by: input.createdBy,
    status: 'registered',
    business_name: input.business_name,
    owner_name: input.owner_name,
    business_reg_no: input.business_reg_no ?? null,
    phone: storedPhone,
    address: input.address ?? null,
    email: input.email ?? null,
    business_type: input.business_type ?? null,
    item: input.item ?? null,
    opened_at: input.opened_at ?? null,
    employee_count: input.employee_count ?? null,
    predecessor_case_id: input.predecessorCaseId ?? null,
    mentee_id: input.menteeId ?? null,
  };

  const { data: created, error } = await admin.from('cases').insert(insert).select('id').single();
  if (error || !created) return { ok: false, error: error?.message ?? '멘티 등록에 실패했습니다.' };

  await admin.from('case_status_history').insert({
    case_id: created.id,
    from_status: null,
    to_status: 'registered',
    changed_by: input.createdBy,
    note: input.predecessorCaseId ? '멘티 등록(승계)' : '멘티 등록',
  });
  await admin.from('audit_logs').insert({
    actor_id: input.createdBy,
    program_id: input.programId,
    action: 'case.create',
    entity_type: 'cases',
    entity_id: created.id,
    metadata: { support_type_id: input.support_type_id, predecessor_case_id: input.predecessorCaseId ?? null },
  });

  // 멘티 계정: 기존 계정 연결(승계) 또는 휴대폰 기반 자동 발급. 실패해도 케이스는 유지.
  let menteeCredential: { email: string; tempPassword: string } | undefined;
  let menteeId = input.menteeId ?? null;
  if (!menteeId) {
    const phoneDigits = (input.phone ?? '').replace(/\D/g, '');
    if (phoneDigits.length >= 10) {
      const email = input.email?.trim() || `m-${created.id.slice(0, 8)}@mentee.local`;
      try {
        const res = await inviteMentee({
          caseId: created.id,
          email,
          name: input.owner_name,
          phone: storedPhone,
          actorId: input.createdBy,
        });
        menteeCredential = { email: res.email, tempPassword: res.tempPassword };
        const { data: row } = await admin.from('cases').select('mentee_id').eq('id', created.id).maybeSingle();
        menteeId = row?.mentee_id ?? null;
      } catch {
        /* 계정 발급 실패는 무시 — 회원관리에서 초대 가능 */
      }
    }
  }
  if (menteeId) {
    await admin
      .from('program_members')
      .upsert({ program_id: input.programId, user_id: menteeId, is_active: true }, { onConflict: 'program_id,user_id' });
  }

  return { ok: true, caseId: created.id, menteeCredential };
}

/** 멘토가 이 행사의 활성 멤버(역할 mentor)인지 */
async function assertMentorInProgram(programId: string, mentorId: string): Promise<string | null> {
  const admin = createAdminClient();
  const [{ data: user }, { data: member }] = await Promise.all([
    admin.from('users').select('role, is_active').eq('id', mentorId).maybeSingle(),
    admin
      .from('program_members')
      .select('id')
      .eq('program_id', programId)
      .eq('user_id', mentorId)
      .eq('is_active', true)
      .maybeSingle(),
  ]);
  if (!user || user.role !== 'mentor' || !user.is_active) return '멘토 계정이 아니거나 비활성 상태입니다.';
  if (!member) return '이 행사에 소속되지 않은 멘토입니다. 회원관리에서 먼저 초대하세요.';
  return null;
}

/** 배정된 멘토를 그룹 명부(support_type_members)에도 올린다 (없으면 추가·비활성이면 재활성) */
async function ensureGroupRoster(supportTypeId: string, mentorId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('support_type_members')
    .upsert(
      { support_type_id: supportTypeId, user_id: mentorId, member_role: 'mentor', is_active: true, left_at: null },
      { onConflict: 'support_type_id,user_id' },
    );
}

/**
 * T2/T12 멘토 배정. registered → mentor_assigned, reassignment_pending → in_progress.
 * 조건부 update 로 원자적 검증. 운영사 전용(호출부 가드).
 */
export async function assignMentor(caseId: string, mentorId: string, actorId: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: c } = await admin
    .from('cases')
    .select('id, status, mentee_id, program_id, support_type_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const denied = assertTransition('assign_mentor', c.status);
  if (denied) return { ok: false, error: denied };
  const memberErr = await assertMentorInProgram(c.program_id, mentorId);
  if (memberErr) return { ok: false, error: memberErr };

  const { data: active } = await admin
    .from('mentor_assignments')
    .select('id')
    .eq('case_id', caseId)
    .eq('is_active', true)
    .maybeSingle();
  if (active) return { ok: false, error: '이미 활성 멘토가 있습니다. 재배정을 사용하세요.' };

  const { data: assignment, error: assignError } = await admin
    .from('mentor_assignments')
    .insert({ case_id: caseId, mentor_id: mentorId, assigned_by: actorId, is_active: true })
    .select('id')
    .single();
  if (assignError || !assignment) return { ok: false, error: assignError?.message ?? '멘토 배정에 실패했습니다.' };

  const to = assignTarget(c.status);
  const { data: updated } = await admin
    .from('cases')
    .update({ status: to })
    .eq('id', caseId)
    .in('status', [...TRANSITIONS.assign_mentor.from])
    .select('id');
  if (!updated || updated.length === 0) {
    await admin.from('mentor_assignments').update({ is_active: false }).eq('id', assignment.id);
    return { ok: false, error: '이미 처리된 케이스입니다. 새로고침 후 다시 시도하세요.' };
  }

  await ensureGroupRoster(c.support_type_id, mentorId);
  await admin.from('case_status_history').insert({
    case_id: caseId,
    from_status: c.status,
    to_status: to,
    changed_by: actorId,
    note: c.status === 'reassignment_pending' ? '멘토 재배정(잔여 회차 승계)' : '멘토 배정',
  });
  await queueNotification(admin, { caseId, programId: c.program_id, recipientId: mentorId, triggerEvent: 'mentor_assigned' });
  if (c.mentee_id) {
    await queueNotification(admin, { caseId, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'mentor_assigned' });
  }
  await admin.from('audit_logs').insert({
    actor_id: actorId,
    program_id: c.program_id,
    action: 'case.assign_mentor',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { mentor_id: mentorId, from_status: c.status },
  });
  return { ok: true, caseId };
}

/**
 * T3 멘토 교체(상태 유지). 현재 활성 배정을 종료(end_kind=reassigned)하고 새 배정을 만든다.
 * 회차는 케이스 누적이라 승계된다. 이미 이행한 회차의 정산은 P4(부분 정산)에서 처리.
 */
export async function reassignMentor(caseId: string, newMentorId: string, actorId: string, reason?: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: c } = await admin
    .from('cases')
    .select('id, status, mentee_id, program_id, support_type_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const denied = assertTransition('reassign_mentor', c.status);
  if (denied) return { ok: false, error: denied };
  const memberErr = await assertMentorInProgram(c.program_id, newMentorId);
  if (memberErr) return { ok: false, error: memberErr };

  const { data: current } = await admin
    .from('mentor_assignments')
    .select('id, mentor_id')
    .eq('case_id', caseId)
    .eq('is_active', true)
    .maybeSingle();
  if (!current) return { ok: false, error: '활성 멘토 배정이 없습니다. 신규 배정을 사용하세요.' };
  if (current.mentor_id === newMentorId) return { ok: false, error: '현재 멘토와 동일합니다. 다른 멘토를 선택하세요.' };

  const now = new Date().toISOString();
  const { error: endErr } = await admin
    .from('mentor_assignments')
    .update({ is_active: false, ended_at: now, ended_by: actorId, end_kind: 'reassigned', end_reason: reason ?? null })
    .eq('id', current.id);
  if (endErr) return { ok: false, error: endErr.message };

  const { error: insErr } = await admin
    .from('mentor_assignments')
    .insert({ case_id: caseId, mentor_id: newMentorId, assigned_by: actorId, is_active: true });
  if (insErr) {
    await admin
      .from('mentor_assignments')
      .update({ is_active: true, ended_at: null, ended_by: null, end_kind: null, end_reason: null })
      .eq('id', current.id);
    return { ok: false, error: insErr.message };
  }

  await ensureGroupRoster(c.support_type_id, newMentorId);
  await admin.from('case_status_history').insert({
    case_id: caseId,
    from_status: c.status,
    to_status: c.status,
    changed_by: actorId,
    note: reason ? `멘토 교체: ${reason}` : '멘토 교체',
  });
  await queueNotification(admin, { caseId, programId: c.program_id, recipientId: newMentorId, triggerEvent: 'mentor_assigned' });
  if (c.mentee_id) {
    await queueNotification(admin, { caseId, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'mentor_assigned' });
  }
  await admin.from('audit_logs').insert({
    actor_id: actorId,
    program_id: c.program_id,
    action: 'case.reassign_mentor',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { from_mentor_id: current.mentor_id, to_mentor_id: newMentorId, reason: reason ?? null },
  });
  return { ok: true, caseId };
}

/** 멘토 배정 회수 → registered. 회차가 하나도 없을 때(mentor_assigned)만. */
export async function recallMentor(caseId: string, actorId: string, reason?: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status, program_id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const denied = assertTransition('recall_mentor', c.status);
  if (denied) return { ok: false, error: denied };

  const { data: active } = await admin
    .from('mentor_assignments')
    .select('id, mentor_id')
    .eq('case_id', caseId)
    .eq('is_active', true)
    .maybeSingle();
  if (!active) return { ok: false, error: '배정된 멘토가 없습니다.' };

  const now = new Date().toISOString();
  const { error: endErr } = await admin
    .from('mentor_assignments')
    .update({ is_active: false, ended_at: now, ended_by: actorId, end_kind: 'recalled', end_reason: reason ?? null })
    .eq('id', active.id);
  if (endErr) return { ok: false, error: endErr.message };

  const { data: updated } = await admin
    .from('cases')
    .update({ status: 'registered' })
    .eq('id', caseId)
    .in('status', [...TRANSITIONS.recall_mentor.from])
    .select('id');
  if (!updated || updated.length === 0) {
    await admin
      .from('mentor_assignments')
      .update({ is_active: true, ended_at: null, ended_by: null, end_kind: null, end_reason: null })
      .eq('id', active.id);
    return { ok: false, error: '회수 처리에 실패했습니다. 새로고침 후 다시 시도하세요.' };
  }

  await admin.from('case_status_history').insert({
    case_id: caseId,
    from_status: c.status,
    to_status: 'registered',
    changed_by: actorId,
    note: reason ? `멘토 배정 회수: ${reason}` : '멘토 배정 회수',
  });
  await admin.from('audit_logs').insert({
    actor_id: actorId,
    program_id: c.program_id,
    action: 'case.recall_mentor',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { recalled_mentor_id: active.mentor_id, reason: reason ?? null },
  });
  return { ok: true, caseId };
}
