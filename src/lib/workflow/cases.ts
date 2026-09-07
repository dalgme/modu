import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/workflow/audit';
import { queueNotification } from '@/lib/workflow/notifications';
import { inviteMentee } from '@/lib/auth/admin-accounts';
import { toStoredPhone } from '@/lib/auth/identifier';
import type { CaseFormInput } from '@/lib/validations/case';
import type { TablesInsert } from '@/types/database';

export interface CreateCaseInput extends CaseFormInput {
  createdBy: string;
  /** 선택된 지원유형 코드 (폐업정리 필수필드 검증용) */
  supportTypeCode: 'management_improvement' | 'closure';
}

export type WorkflowResult = { ok: true; caseId: string } | { ok: false; error: string };

/** 케이스 등록 결과(멘티 계정 자동발급 시 임시 자격증명 포함) */
export type CreateCaseResult =
  | { ok: true; caseId: string; menteeCredential?: { email: string; tempPassword: string } }
  | { ok: false; error: string };

/**
 * 케이스 등록 (워크플로우 1단계). status=registered.
 * 폐업정리면 전용 필드 필수 검증. case_status_history·audit_logs 기록.
 * 자격심사·선정 로직은 포함하지 않는다.
 */
export async function createCase(input: CreateCaseInput): Promise<CreateCaseResult> {
  if (input.supportTypeCode === 'closure') {
    if (!input.closure_status) {
      return { ok: false, error: '폐업정리는 폐업/폐업예정 구분이 필요합니다.' };
    }
    if (input.exclusive_area_pyeong === undefined) {
      return { ok: false, error: '폐업정리는 전용면적(평)을 입력해야 합니다.' };
    }
  }

  const supabase = createClient();

  // 저장 형식 표준화(010-XXXX-XXXX) — 표시·검색 일관화. 로그인·임시비번은 숫자 정규화로 매칭.
  const storedPhone = toStoredPhone(input.phone) ?? input.phone;

  const insert: TablesInsert<'cases'> = {
    support_type_id: input.support_type_id,
    created_by: input.createdBy,
    status: 'registered',
    business_name: input.business_name,
    owner_name: input.owner_name,
    business_reg_no: input.business_reg_no,
    phone: storedPhone,
    address: input.address,
    email: input.email ?? null,
    business_type: input.business_type ?? null,
    item: input.item ?? null,
    opened_at: input.opened_at ?? null,
    employee_count: input.employee_count ?? null,
    // 폐업정리 전용 (경영개선이면 무시)
    closure_status: input.supportTypeCode === 'closure' ? (input.closure_status ?? null) : null,
    closed_at: input.supportTypeCode === 'closure' ? (input.closed_at ?? null) : null,
    revenue_last_year:
      input.supportTypeCode === 'closure' ? (input.revenue_last_year ?? null) : null,
    lease_deposit: input.supportTypeCode === 'closure' ? (input.lease_deposit ?? null) : null,
    monthly_rent: input.supportTypeCode === 'closure' ? (input.monthly_rent ?? null) : null,
    exclusive_area_pyeong:
      input.supportTypeCode === 'closure' ? (input.exclusive_area_pyeong ?? null) : null,
  };

  const { data: created, error } = await supabase
    .from('cases')
    .insert(insert)
    .select('id')
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? '케이스 등록에 실패했습니다.' };
  }

  await supabase.from('case_status_history').insert({
    case_id: created.id,
    from_status: null,
    to_status: 'registered',
    changed_by: input.createdBy,
    note: '케이스 등록',
  });

  await logAudit(supabase, {
    actorId: input.createdBy,
    action: 'case.create',
    entityType: 'cases',
    entityId: created.id,
    metadata: { support_type_id: input.support_type_id },
  });

  // 멘티 로그인 계정 자동 발급 (진흥원 '플랫폼 등록' = 회원 등록).
  // 이메일 없으면 합성 로그인ID 를 만들고, 멘티는 휴대폰 번호로 로그인한다(임시비번=휴대폰).
  // 계정 발급 실패(중복 등)해도 케이스는 유지 — 넥스트랩이 초대 패널로 후처리 가능.
  let menteeCredential: { email: string; tempPassword: string } | undefined;
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
    } catch {
      // 계정 발급 실패는 무시 (케이스는 정상 등록됨)
    }
  }

  return { ok: true, caseId: created.id, menteeCredential };
}

/**
 * 멘토 배정 (워크플로우 2단계). registered → mentor_assigned.
 * 상태 전이 가드: registered 에서만 가능 (조건부 update 로 원자적 검증).
 */
export async function assignMentor(
  caseId: string,
  mentorId: string,
  actorId: string,
): Promise<WorkflowResult> {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from('cases')
    .select('id, status, mentee_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  }
  if (existing.status !== 'registered') {
    return { ok: false, error: '멘토 배정은 대상자 등록 단계에서만 가능합니다.' };
  }

  // 배정 삽입
  const { data: assignment, error: assignError } = await supabase
    .from('mentor_assignments')
    .insert({ case_id: caseId, mentor_id: mentorId, assigned_by: actorId, is_active: true })
    .select('id')
    .single();
  if (assignError || !assignment) {
    return { ok: false, error: assignError?.message ?? '멘토 배정에 실패했습니다.' };
  }

  // 상태 전이 (registered 인 동안만 — 동시성 가드)
  const { data: updated } = await supabase
    .from('cases')
    .update({ status: 'mentor_assigned' })
    .eq('id', caseId)
    .eq('status', 'registered')
    .select('id');
  if (!updated || updated.length === 0) {
    // 다른 처리가 선행됨 → 방금 삽입한 배정 롤백
    await supabase.from('mentor_assignments').update({ is_active: false }).eq('id', assignment.id);
    return { ok: false, error: '이미 처리된 케이스입니다. 새로고침 후 다시 시도하세요.' };
  }

  await supabase.from('case_status_history').insert({
    case_id: caseId,
    from_status: 'registered',
    to_status: 'mentor_assigned',
    changed_by: actorId,
    note: '멘토 배정',
  });

  // 알림 큐 등록 (멘토 + 멘티) — 실제 발송은 단계 13
  await queueNotification(supabase, {
    caseId,
    recipientId: mentorId,
    triggerEvent: 'mentor_assigned',
  });
  if (existing.mentee_id) {
    await queueNotification(supabase, {
      caseId,
      recipientId: existing.mentee_id,
      triggerEvent: 'mentor_assigned',
    });
  }

  await logAudit(supabase, {
    actorId,
    action: 'case.assign_mentor',
    entityType: 'cases',
    entityId: caseId,
    metadata: { mentor_id: mentorId },
  });

  return { ok: true, caseId };
}

/**
 * 멘토 재배정. 이미 배정된 케이스의 담당 멘토를 다른 멘토로 교체한다.
 * 상태는 유지하고 현재 활성 배정을 비활성화한 뒤 새 배정을 활성으로 삽입한다.
 * (넥스트랩 담당자 전용 — 멘토 사정으로 담당자 변경이 필요한 경우)
 */
export async function reassignMentor(
  caseId: string,
  newMentorId: string,
  actorId: string,
): Promise<WorkflowResult> {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from('cases')
    .select('id, status, mentee_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  }
  if (existing.status === 'registered') {
    return { ok: false, error: '아직 멘토가 배정되지 않았습니다. 신규 배정을 사용하세요.' };
  }
  if (existing.status === 'withdrawn' || existing.status === 'rejected') {
    return { ok: false, error: '종료된 케이스는 멘토를 재배정할 수 없습니다.' };
  }

  // 현재 활성 배정 조회
  const { data: current } = await supabase
    .from('mentor_assignments')
    .select('id, mentor_id')
    .eq('case_id', caseId)
    .eq('is_active', true)
    .maybeSingle();
  if (!current) {
    return { ok: false, error: '활성 멘토 배정이 없습니다. 신규 배정을 사용하세요.' };
  }
  if (current.mentor_id === newMentorId) {
    return { ok: false, error: '현재 멘토와 동일합니다. 다른 멘토를 선택하세요.' };
  }

  // 기존 활성 배정 모두 비활성화
  const { error: deactivateError } = await supabase
    .from('mentor_assignments')
    .update({ is_active: false })
    .eq('case_id', caseId)
    .eq('is_active', true);
  if (deactivateError) {
    return { ok: false, error: deactivateError.message };
  }

  // 새 멘토 활성 배정 삽입
  const { error: assignError } = await supabase
    .from('mentor_assignments')
    .insert({ case_id: caseId, mentor_id: newMentorId, assigned_by: actorId, is_active: true });
  if (assignError) {
    // 롤백: 이전 멘토 다시 활성화
    await supabase.from('mentor_assignments').update({ is_active: true }).eq('id', current.id);
    return { ok: false, error: assignError.message };
  }

  await supabase.from('case_status_history').insert({
    case_id: caseId,
    from_status: existing.status,
    to_status: existing.status,
    changed_by: actorId,
    note: '멘토 재배정',
  });

  // 새 멘토에게 배정 알림 큐 등록
  await queueNotification(supabase, {
    caseId,
    recipientId: newMentorId,
    triggerEvent: 'mentor_assigned',
  });

  await logAudit(supabase, {
    actorId,
    action: 'case.reassign_mentor',
    entityType: 'cases',
    entityId: caseId,
    metadata: { from_mentor_id: current.mentor_id, to_mentor_id: newMentorId },
  });

  return { ok: true, caseId };
}

/**
 * 멘토 배정 회수. 배정 이후라도 넥스트랩이 배정을 취소하고 케이스를 대상자 등록(registered)
 * 단계로 되돌린다. 이후 진흥원이 내용을 수정·재업로드해 다시 멘토 배정을 요청할 수 있다.
 * (종결/미배정 케이스는 회수 불가)
 */
export async function recallMentor(caseId: string, actorId: string): Promise<WorkflowResult> {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from('cases')
    .select('id, status')
    .eq('id', caseId)
    .maybeSingle();
  if (!existing) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  if (existing.status === 'registered') {
    return { ok: false, error: '이미 대상자 등록 단계입니다.' };
  }
  if (
    existing.status === 'withdrawn' ||
    existing.status === 'rejected' ||
    existing.status === 'payment_approved'
  ) {
    return { ok: false, error: '종결된 케이스는 회수할 수 없습니다.' };
  }

  const { data: active } = await supabase
    .from('mentor_assignments')
    .select('id, mentor_id')
    .eq('case_id', caseId)
    .eq('is_active', true)
    .maybeSingle();
  if (!active) return { ok: false, error: '배정된 멘토가 없습니다.' };

  // 활성 배정 비활성화
  const { error: deactivateError } = await supabase
    .from('mentor_assignments')
    .update({ is_active: false })
    .eq('case_id', caseId)
    .eq('is_active', true);
  if (deactivateError) return { ok: false, error: deactivateError.message };

  // 대상자 등록 단계로 되돌림
  const { data: updated } = await supabase
    .from('cases')
    .update({ status: 'registered' })
    .eq('id', caseId)
    .select('id');
  if (!updated || updated.length === 0) {
    // 롤백
    await supabase.from('mentor_assignments').update({ is_active: true }).eq('id', active.id);
    return { ok: false, error: '회수 처리에 실패했습니다. 다시 시도하세요.' };
  }

  await supabase.from('case_status_history').insert({
    case_id: caseId,
    from_status: existing.status,
    to_status: 'registered',
    changed_by: actorId,
    note: '멘토 배정 회수',
  });

  await logAudit(supabase, {
    actorId,
    action: 'case.recall_mentor',
    entityType: 'cases',
    entityId: caseId,
    metadata: { from_status: existing.status, recalled_mentor_id: active.mentor_id },
  });

  return { ok: true, caseId };
}
