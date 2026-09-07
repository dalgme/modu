'use server';

import { revalidatePath } from 'next/cache';

import {
  mentorOrNull,
  mentorOfCaseOrNull,
  MENTOR_ONLY_ERROR,
  NOT_ASSIGNED_ERROR,
  requireNextlab,
  requireInstitution,
  requireUser,
} from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCaseScopedSignedUrl } from '@/lib/storage/files';
import { queueNotification } from '@/lib/workflow/notifications';
import { sendSms } from '@/lib/notifications/provider';
import { sendEmail } from '@/lib/notifications/email';
import { normalizePhone } from '@/lib/auth/identifier';
import { getMentorWorkflowState } from '@/lib/data/mentor-workflow';
import { getImpersonation, actingNote } from '@/lib/auth/impersonation';

/** '신청서 송신하기'로 under_review 전이를 허용하는 케이스 상태 (경영개선 기준) */
const SUBMITTABLE_STATUSES = [
  'log_completed',
  'application_drafted',
  'contractor_registered',
  'rejected',
] as const;

/** 폐업 전용 추가 허용 상태 — 일지 없이 지원금신청서만으로 송신 가능하기 때문 */
const CLOSURE_EXTRA_SUBMITTABLE_STATUSES = ['mentor_assigned', 'contacted'] as const;
import {
  applicationContentSchema,
  reviewSchema,
  approvalSchema,
} from '@/lib/validations/application';
import {
  draftSupportApplication,
  submitReview,
  approveOrRejectApplication,
} from '@/lib/workflow/application';
import type { WorkflowResult } from '@/lib/workflow/cases';

/**
 * 멘토: 신청서 송신하기.
 * 지원신청서 최종저장 + 공사업체 필수서류 완료를 확인한 뒤 under_review(검수 중) 로 전이하고
 * 넥스트랩 담당자(전원)에게 대시보드 알림 + 접수 문자 + 이메일을 발송한다(진흥원은 검수 완료 후 통보).
 */
export async function submitApplicationAction(caseId: string): Promise<WorkflowResult> {
  const profile = await mentorOrNull();
  if (!profile) return { ok: false, error: MENTOR_ONLY_ERROR };
  const admin = createAdminClient();

  const { data: assign } = await admin
    .from('mentor_assignments')
    .select('id')
    .eq('case_id', caseId)
    .eq('mentor_id', profile.id)
    .eq('is_active', true)
    .maybeSingle();
  if (!assign) return { ok: false, error: '담당 멘토가 아닙니다.' };

  const { data: caseRow } = await admin
    .from('cases')
    .select('status, business_name, support_type_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!caseRow) return { ok: false, error: '케이스를 찾을 수 없습니다.' };

  const { data: type } = await admin
    .from('support_types')
    .select('code')
    .eq('id', caseRow.support_type_id)
    .maybeSingle();
  const isClosure = type?.code === 'closure';
  const typeLabel = isClosure ? '폐업지원' : '경영개선';

  const state = await getMentorWorkflowState(caseId, type?.code ?? null, caseRow.status);
  if (state.submitted) return { ok: true, caseId }; // 이미 송신됨(멱등)
  if (isClosure) {
    // 폐업: 지원금신청서(파일)가 등록되면 송신 가능 (지원신청서/공사업체 서류 단계 없음)
    const { count } = await admin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('case_id', caseId)
      .eq('doc_key', 'payment_application_file');
    if (!count || count === 0) {
      return { ok: false, error: '지원금신청서를 올린 뒤 송신할 수 있습니다.' };
    }
  } else {
    if (!state.applicationFinalized) {
      return { ok: false, error: '지원신청서를 최종 저장한 뒤 송신할 수 있습니다.' };
    }
    if (!state.contractorDocsDone) {
      return {
        ok: false,
        error: '공사업체 필수 서류(견적서·비교견적서·공급업체 사업자등록증)를 모두 업로드하세요.',
      };
    }
  }

  // 폐업은 멘토링 일지 없이 '지원금신청서' 업로드만으로 송신 게이트가 열리므로(mentor-workflow 의
  // closurePaymentDone), 일지 이전 상태(멘토 배정/연락)도 허용해야 버튼과 액션이 어긋나지 않는다.
  const submittableStatuses = isClosure
    ? [...SUBMITTABLE_STATUSES, ...CLOSURE_EXTRA_SUBMITTABLE_STATUSES]
    : [...SUBMITTABLE_STATUSES];
  const { data: updated } = await admin
    .from('cases')
    .update({ status: 'under_review' })
    .eq('id', caseId)
    .in('status', submittableStatuses)
    .select('id');
  if (!updated || updated.length === 0) {
    return { ok: false, error: '이미 처리되었거나 송신할 수 없는 단계입니다.' };
  }

  // 명의(changed_by)는 멘토, 실행자(audit actor)는 실제로 누른 사람.
  // 넥스트랩이 대행해 송신한 경우 이력 note 와 감사 metadata 양쪽에 대행 사실을 남긴다.
  const impersonation = await getImpersonation();
  const onBehalf = impersonation?.target.id === profile.id ? impersonation : null;
  await admin.from('case_status_history').insert({
    case_id: caseId,
    from_status: caseRow.status,
    to_status: 'under_review',
    changed_by: profile.id,
    note: await actingNote('신청서 송신(멘토) → 넥스트랩 검수 대기', profile.id),
  });
  await admin.from('audit_logs').insert({
    actor_id: onBehalf ? onBehalf.actorId : profile.id,
    action: 'case.application_submitted',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: onBehalf ? { on_behalf_of: profile.id, via: 'view-as' } : null,
  });

  // 넥스트랩(전원) 대시보드 알림 + 접수 문자 + 이메일 (진흥원은 검수 완료 후 통보)
  const { data: staff } = await admin
    .from('users')
    .select('id, phone, email')
    .eq('role', 'nextlab');
  const smsText = `${caseRow.business_name}, ${typeLabel} 신청 서류가 접수되었습니다. 검수를 진행해 주세요. -restart.poclab.kr`;
  const emailSubject = `[OP.map] ${caseRow.business_name} ${typeLabel} 신청 서류 검수 요청`;
  const emailBody = `${caseRow.business_name}(${typeLabel}) 지원신청 서류가 접수되어 검수 대기 중입니다.\n넥스트랩 콘솔에서 검수를 진행해 주세요.\nhttps://restart.poclab.kr/nextlab/cases/${caseId}`;
  for (const u of staff ?? []) {
    await queueNotification(admin, {
      caseId,
      recipientId: u.id,
      triggerEvent: 'under_review',
    });
    const phone = u.phone ? normalizePhone(u.phone) : null;
    if (phone) {
      try {
        await sendSms(phone, smsText);
      } catch {
        // 문자 실패는 송신 성공에 영향 주지 않음(대시보드 알림/상태 전이는 완료)
      }
    }
    if (u.email) {
      try {
        await sendEmail(u.email, emailSubject, emailBody);
      } catch {
        // 이메일 실패도 송신 성공에 영향 주지 않음
      }
    }
  }

  revalidatePath(`/mentor/cases/${caseId}`);
  return { ok: true, caseId };
}

/** 멘토: 지원신청서 저장 (임시/최종). finalize=true 면 최종저장(멘티 사업자등록증은 선택) */
export async function draftApplicationAction(input: unknown): Promise<WorkflowResult> {
  const profile = await mentorOrNull();
  if (!profile) return { ok: false, error: MENTOR_ONLY_ERROR };
  const parsed = applicationContentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }
  // 대행 중에는 DB 의 auth.uid() 가 넥스트랩(is_staff)이라 RLS 가 케이스 스코프를 막지 못한다.
  // 멘토 명의로 쓰는 이상 배정은 코드에서 직접 확인한다. (submitApplicationAction 과 동일)
  if (!(await mentorOfCaseOrNull(parsed.data.caseId))) {
    return { ok: false, error: NOT_ASSIGNED_ERROR };
  }
  const finalize = !!(input as { finalize?: boolean } | null)?.finalize;
  const result = await draftSupportApplication(
    parsed.data.caseId,
    profile.id,
    {
      reason: parsed.data.reason,
      requested_amount: parsed.data.requested_amount,
      cost_excl_vat: parsed.data.cost_excl_vat,
      categories: parsed.data.categories,
      plan_intro: parsed.data.plan_intro,
      plan_status: parsed.data.plan_status,
      plan_need: parsed.data.plan_need,
      plan_effect: parsed.data.plan_effect,
      construction_company: parsed.data.construction_company,
      construction_region: parsed.data.construction_region,
      construction_reg_no: parsed.data.construction_reg_no,
      construction_rep: parsed.data.construction_rep,
      construction_biztype: parsed.data.construction_biztype,
      construction_phone: parsed.data.construction_phone,
      construction_mobile: parsed.data.construction_mobile,
      construction_period: parsed.data.construction_period,
      construction_content: parsed.data.construction_content,
    },
    { finalize },
  );
  if (result.ok) revalidatePath(`/mentor/cases/${parsed.data.caseId}`);
  return result;
}

/** 넥스트랩: 검수 (7단계) */
export async function reviewAction(input: unknown): Promise<WorkflowResult> {
  const profile = await requireNextlab();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }
  const result = await submitReview(
    parsed.data.caseId,
    profile.id,
    parsed.data.result,
    parsed.data.comment,
  );
  if (result.ok) revalidatePath(`/nextlab/cases/${parsed.data.caseId}`);
  return result;
}

/** 진흥원: 승인/반려 (8단계) */
export async function approvalAction(input: unknown): Promise<WorkflowResult> {
  const profile = await requireInstitution();
  const parsed = approvalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }
  const result = await approveOrRejectApplication(
    parsed.data.caseId,
    profile.id,
    parsed.data.result,
    parsed.data.reason,
  );
  if (result.ok) revalidatePath(`/institution/cases/${parsed.data.caseId}`);
  return result;
}

/** 멘티가 첨부한 서류의 signed URL (멘토가 케이스 접근 권한 보유 시) */
export async function getCaseDocumentUrlAction(documentId: string): Promise<string | null> {
  if (!(await mentorOrNull())) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('case_id, storage_path')
    .eq('id', documentId)
    .maybeSingle();
  if (!data?.storage_path || !data.case_id) return null;
  // 대행 중에는 RLS 가 넥스트랩(is_staff) 기준이라 임의 케이스 문서까지 열린다 → 배정을 직접 확인.
  if (!(await mentorOfCaseOrNull(data.case_id))) return null;
  // 경로가 해당 케이스 폴더에 속하는지까지 검증 (경로 조작 방지)
  return createCaseScopedSignedUrl('documents', data.case_id, data.storage_path, 300);
}

/** 생성된 신청서 PDF 의 signed URL (케이스 접근 권한자만) */
export async function getApplicationPdfUrl(caseId: string): Promise<string | null> {
  await requireUser();
  const supabase = createClient();
  const { data } = await supabase
    .from('support_applications')
    .select('generated_pdf_path')
    .eq('case_id', caseId)
    .maybeSingle();
  if (!data?.generated_pdf_path) return null;
  return createCaseScopedSignedUrl('documents', caseId, data.generated_pdf_path, 300);
}
