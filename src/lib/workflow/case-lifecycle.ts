import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/workflow/audit';
import { queueNotification } from '@/lib/workflow/notifications';
import { sendSms } from '@/lib/notifications/provider';
import { sendEmail } from '@/lib/notifications/email';
import { normalizePhone } from '@/lib/auth/identifier';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import type { WorkflowResult } from '@/lib/workflow/cases';

/** 종결(더 이상 전이 불가) 상태 */
const TERMINAL: CaseStatus[] = ['withdrawn', 'payment_approved'];

/**
 * 지원신청서 수동 접수 (오프라인 제출). 시스템 밖에서 서류로 접수한 경우 staff 가
 * 검수 완료(reviewed)로 바로 전이시켜 진흥원 승인 대기로 넘긴다. staff 전용(호출부 가드).
 * 검수 완료 이전(비종결) 단계에서만 가능.
 */
export async function manualReceiveApplication(
  caseId: string,
  actorId: string,
): Promise<WorkflowResult> {
  const supabase = createClient();
  const { data: c } = await supabase
    .from('cases')
    .select('status, business_name')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const step = CASE_STATUS_META[c.status].step;
  if (step === 0) return { ok: false, error: '종결된 케이스입니다.' };
  if (step >= CASE_STATUS_META.reviewed.step) {
    return { ok: false, error: '이미 검수 완료 이후 단계입니다.' };
  }

  const { data: updated } = await supabase
    .from('cases')
    .update({ status: 'reviewed' })
    .eq('id', caseId)
    .eq('status', c.status)
    .select('id');
  if (!updated || updated.length === 0) {
    return { ok: false, error: '상태가 변경되어 처리하지 못했습니다. 새로고침 후 다시 시도하세요.' };
  }

  await supabase.from('case_status_history').insert({
    case_id: caseId,
    from_status: c.status,
    to_status: 'reviewed',
    changed_by: actorId,
    note: '지원신청서 수동 접수(오프라인) → 검수 완료',
  });

  // 진흥원 승인 대기 알림 (대시보드 + 문자 + 이메일)
  const { data: institutions } = await supabase
    .from('users')
    .select('id, phone, email')
    .eq('role', 'institution');
  const smsText = `${c.business_name} 지원신청 서류가 수동 접수(검수 완료)되어 승인 대기 중입니다. -restart.poclab.kr`;
  const emailSubject = `[OP.map] ${c.business_name} 지원신청 서류 승인 요청(수동 접수)`;
  const emailBody = `${c.business_name} 지원신청 서류가 오프라인 수동 접수되어 검수 완료 처리되었습니다.\n진흥원 콘솔에서 승인/반려해 주세요.\nhttps://restart.poclab.kr/institution/cases/${caseId}`;
  for (const u of institutions ?? []) {
    await queueNotification(supabase, { caseId, recipientId: u.id, triggerEvent: 'reviewed' });
    const phone = u.phone ? normalizePhone(u.phone) : null;
    if (phone) {
      try {
        await sendSms(phone, smsText);
      } catch {
        /* 문자 실패는 처리 성공에 영향 없음 */
      }
    }
    if (u.email) {
      try {
        await sendEmail(u.email, emailSubject, emailBody);
      } catch {
        /* 이메일 실패는 처리 성공에 영향 없음 */
      }
    }
  }

  await logAudit(supabase, {
    actorId,
    action: 'case.manual_receive',
    entityType: 'cases',
    entityId: caseId,
    metadata: { from: c.status },
  });

  return { ok: true, caseId };
}

/**
 * 지원 포기 처리 (붙임12). 현재 진행 상태와 무관하게 케이스를 종결(withdrawn)한다.
 * 활성 멘토 배정은 해제하고, 사유를 이력·감사로그에 남긴다. staff 전용(호출부 가드).
 */
export async function withdrawCase(
  caseId: string,
  actorId: string,
  reason: string,
): Promise<WorkflowResult> {
  if (!reason || !reason.trim()) return { ok: false, error: '포기 사유를 입력하세요.' };

  const supabase = createClient();
  const { data: c } = await supabase.from('cases').select('status').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  if (TERMINAL.includes(c.status)) return { ok: false, error: '이미 종결된 케이스입니다.' };

  // 낙관적 동시성 가드: 읽은 상태 그대로일 때만 전이
  const { data: updated } = await supabase
    .from('cases')
    .update({ status: 'withdrawn' })
    .eq('id', caseId)
    .eq('status', c.status)
    .select('id');
  if (!updated || updated.length === 0) {
    return { ok: false, error: '상태가 변경되어 처리하지 못했습니다. 새로고침 후 다시 시도하세요.' };
  }

  await supabase.from('case_status_history').insert({
    case_id: caseId,
    from_status: c.status,
    to_status: 'withdrawn',
    changed_by: actorId,
    note: reason.trim(),
  });

  // 활성 멘토 배정 해제
  await supabase
    .from('mentor_assignments')
    .update({ is_active: false })
    .eq('case_id', caseId)
    .eq('is_active', true);

  await logAudit(supabase, {
    actorId,
    action: 'case.withdraw',
    entityType: 'cases',
    entityId: caseId,
    metadata: { reason: reason.trim(), from: c.status },
  });

  return { ok: true, caseId };
}

/**
 * 승인 통보 완료 수동 처리 (워크플로우 9단계 · approved → notified).
 * 평소에는 알림톡/SMS 발송 성공 시 자동 전이(maybeMarkNotified)되지만, 알림 채널이
 * 미설정이거나 발송에 실패하면 케이스가 approved 에 멈춰 멘티가 증빙 등록으로 넘어가지
 * 못한다. 이 함수는 staff 가 통보 완료를 수동으로 확정해 파이프라인을 진행시킨다.
 * staff 전용(호출부 가드).
 */
export async function markNotified(caseId: string, actorId: string): Promise<WorkflowResult> {
  const supabase = createClient();
  const { data: c } = await supabase.from('cases').select('status').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  if (c.status === 'notified') return { ok: false, error: '이미 통보 완료 처리된 케이스입니다.' };
  if (c.status !== 'approved') {
    return { ok: false, error: '승인(approved) 단계에서만 통보 완료 처리할 수 있습니다.' };
  }

  const { data: updated } = await supabase
    .from('cases')
    .update({ status: 'notified' })
    .eq('id', caseId)
    .eq('status', 'approved')
    .select('id');
  if (!updated || updated.length === 0) {
    return { ok: false, error: '상태가 변경되어 처리하지 못했습니다. 새로고침 후 다시 시도하세요.' };
  }

  await supabase.from('case_status_history').insert({
    case_id: caseId,
    from_status: 'approved',
    to_status: 'notified',
    changed_by: actorId,
    note: '승인 통보 완료 (수동)',
  });

  await logAudit(supabase, {
    actorId,
    action: 'case.mark_notified',
    entityType: 'cases',
    entityId: caseId,
    metadata: { manual: true },
  });

  return { ok: true, caseId };
}

/**
 * 사업 변경 승인 기록 (붙임11). 케이스는 현재 단계에 머무르며(파이프라인 이탈 없음),
 * 승인된 변경 내용을 감사로그로 남긴다. staff 전용(호출부 가드).
 */
export async function recordChangeApproval(
  caseId: string,
  actorId: string,
  note: string,
): Promise<WorkflowResult> {
  if (!note || !note.trim()) return { ok: false, error: '변경 승인 내용을 입력하세요.' };

  const supabase = createClient();
  const { data: c } = await supabase.from('cases').select('id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };

  await logAudit(supabase, {
    actorId,
    action: 'case.change_approved',
    entityType: 'cases',
    entityId: caseId,
    metadata: { note: note.trim() },
  });

  return { ok: true, caseId };
}
