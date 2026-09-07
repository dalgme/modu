import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/workflow/audit';
import { queueNotification } from '@/lib/workflow/notifications';
import { sendSms } from '@/lib/notifications/provider';
import { sendEmail } from '@/lib/notifications/email';
import { normalizePhone } from '@/lib/auth/identifier';
import { hasActiveEditGrant } from '@/lib/data/edit-grants';
import { deleteCaseDocsByKey } from '@/lib/data/case-docs';
import { uploadFile } from '@/lib/storage/files';
import { renderTemplate, htmlToPdf } from '@/lib/documents/render';
import {
  applicationTemplateKey,
  buildApplicationData,
  getTemplateHtml,
  type ApplicationContent,
} from '@/lib/documents/templates';
import { getCaseSignatureImages, signaturePlaceholders } from '@/lib/data/signatures';
import type { WorkflowResult } from '@/lib/workflow/cases';

const SAVEABLE = [
  'log_completed',
  'contractor_registered',
  'application_drafted',
  'rejected',
] as const;

/**
 * 지원신청서 저장 + 붙임서식 PDF 자동생성.
 * '임시저장'은 내용만 저장, '최종저장(finalize)'은 content.finalized_at 를 기록한다.
 * (멘티기업 사업자등록증은 선택 첨부 — 최종저장 필수 조건 아님)
 * (넥스트랩 검수 요청 알림·application_drafted 전이는 '송신하기' 단계에서 수행 — 여기서는 하지 않음)
 */
export async function draftSupportApplication(
  caseId: string,
  mentorId: string,
  content: ApplicationContent,
  opts?: { finalize?: boolean },
): Promise<WorkflowResult> {
  const supabase = createClient();

  const { data: caseRow } = await supabase.from('cases').select('*').eq('id', caseId).maybeSingle();
  if (!caseRow) return { ok: false, error: '케이스에 접근할 수 없습니다.' };
  const editable =
    (SAVEABLE as readonly string[]).includes(caseRow.status) ||
    (caseRow.status === 'reviewed' && (await hasActiveEditGrant(caseId)));
  if (!editable) {
    return {
      ok: false,
      error: '지금은 지원신청서를 저장할 수 없는 단계입니다. (멘토링 일지 완료 후 가능)',
    };
  }

  // 멘티기업 사업자등록증은 '선택' 첨부 — 최종저장 필수 조건에서 제외.
  const { data: type } = await supabase
    .from('support_types')
    .select('*')
    .eq('id', caseRow.support_type_id)
    .single();
  const { data: contractor } = await supabase
    .from('contractors')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 신청서 upsert (케이스당 1건)
  const { data: existing } = await supabase
    .from('support_applications')
    .select('id')
    .eq('case_id', caseId)
    .maybeSingle();
  const contentJson = {
    reason: content.reason,
    requested_amount: content.requested_amount ?? null,
    cost_excl_vat: content.cost_excl_vat ?? null,
    categories: content.categories ?? [],
    plan_intro: content.plan_intro ?? null,
    plan_status: content.plan_status ?? null,
    plan_need: content.plan_need ?? null,
    plan_effect: content.plan_effect ?? null,
    construction_company: content.construction_company ?? null,
    construction_region: content.construction_region ?? null,
    construction_reg_no: content.construction_reg_no ?? null,
    construction_rep: content.construction_rep ?? null,
    construction_biztype: content.construction_biztype ?? null,
    construction_phone: content.construction_phone ?? null,
    construction_mobile: content.construction_mobile ?? null,
    construction_period: content.construction_period ?? null,
    construction_content: content.construction_content ?? null,
    // 최종저장 표식 (jsonb 내 저장 · 스키마 변경 없이 '완료' 여부 판별)
    finalized_at: opts?.finalize ? new Date().toISOString() : null,
  };
  if (existing) {
    await supabase
      .from('support_applications')
      .update({ content: contentJson, drafted_by: mentorId })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('support_applications')
      .insert({ case_id: caseId, content: contentJson, drafted_by: mentorId });
  }

  // 컨설턴트(멘토) 및 컨설팅 회차 일자 — 붙임5 2번 영역 자동 연동
  const { data: assign } = await supabase
    .from('mentor_assignments')
    .select('mentor_id')
    .eq('case_id', caseId)
    .eq('is_active', true)
    .maybeSingle();
  let consultantName: string | null = null;
  let consultantPhone: string | null = null;
  if (assign) {
    const { data: mentor } = await supabase
      .from('users')
      .select('name, phone')
      .eq('id', assign.mentor_id)
      .maybeSingle();
    consultantName = mentor?.name ?? null;
    consultantPhone = mentor?.phone ?? null;
  }
  const { data: logs } = await supabase
    .from('mentoring_logs')
    .select('visited_at')
    .eq('case_id', caseId)
    .order('visited_at', { ascending: true });
  const consultingDates = (logs ?? []).map((l) => l.visited_at);

  // 붙임서식 PDF 생성 (best-effort — 실패해도 신청서는 저장, 재생성 가능)
  if (type) {
    try {
      const templateKey = applicationTemplateKey(type.code);
      const html = await getTemplateHtml(templateKey);
      if (html) {
        const rendered = renderTemplate(html, {
          ...buildApplicationData(caseRow, type, contractor, content, {
            consultantName,
            consultantPhone,
            consultingDates,
          }),
          ...signaturePlaceholders(await getCaseSignatureImages(caseId)),
        });
        const pdf = await htmlToPdf(rendered);
        const meta = await uploadFile('documents', caseId, pdf, 'application/pdf', 'pdf');
        // 교체/상호배타: 기존 생성본을 대체하고, 업로드본(support_application_file)도 제거해 둘 다 남지 않게 한다.
        await deleteCaseDocsByKey(caseId, 'support_application');
        await deleteCaseDocsByKey(caseId, 'support_application_file');
        await supabase.from('documents').insert({
          case_id: caseId,
          doc_key: 'support_application',
          doc_name: '지원신청서(생성)',
          storage_path: meta.storagePath,
          sha256: meta.sha256,
          uploaded_by: mentorId,
          file_size: meta.size,
          mime_type: 'application/pdf',
        });
        await supabase
          .from('support_applications')
          .update({ generated_pdf_path: meta.storagePath })
          .eq('case_id', caseId);
      }
    } catch {
      // PDF 생성 실패는 치명적이지 않음 (데이터 저장됨, 재생성 가능)
    }
  }

  await logAudit(supabase, {
    actorId: mentorId,
    action: opts?.finalize ? 'case.application_finalized' : 'case.application_saved',
    entityType: 'cases',
    entityId: caseId,
  });

  return { ok: true, caseId };
}

/**
 * 워크플로우: 넥스트랩 검수. 승인 → reviewed(진흥원 통보), 보완요청 → application_drafted(멘토 재작성).
 * 검수는 under_review(지원신청서 검수 중) 단계에서만 수행한다.
 */
export async function submitReview(
  caseId: string,
  reviewerId: string,
  result: 'approved' | 'revision_requested',
  comment: string | undefined,
): Promise<WorkflowResult> {
  const supabase = createClient();
  const { data: caseRow } = await supabase
    .from('cases')
    .select('status, business_name')
    .eq('id', caseId)
    .maybeSingle();
  if (!caseRow) return { ok: false, error: '케이스에 접근할 수 없습니다.' };
  if (caseRow.status !== 'under_review') {
    return { ok: false, error: '지원신청서 검수 중 단계에서만 검수할 수 있습니다.' };
  }

  await supabase.from('reviews').insert({
    case_id: caseId,
    reviewer_id: reviewerId,
    result,
    comment: comment ?? null,
  });

  if (result === 'approved') {
    const { data: updated } = await supabase
      .from('cases')
      .update({ status: 'reviewed' })
      .eq('id', caseId)
      .eq('status', 'under_review')
      .select('id');
    if (!updated || updated.length === 0) {
      return { ok: false, error: '이미 처리되었습니다.' };
    }
    await supabase.from('case_status_history').insert({
      case_id: caseId,
      from_status: 'under_review',
      to_status: 'reviewed',
      changed_by: reviewerId,
      note: '넥스트랩 검수 완료',
    });
    // 진흥원 승인 대기 알림 — 대시보드 + 문자 + 이메일
    const { data: institutions } = await supabase
      .from('users')
      .select('id, phone, email')
      .eq('role', 'institution');
    const smsText = `${caseRow.business_name} 지원신청 서류 검수가 완료되어 승인 대기 중입니다. 서류를 확인해 주세요. -restart.poclab.kr`;
    const emailSubject = `[OP.map] ${caseRow.business_name} 지원신청 서류 승인 요청(검수 완료)`;
    const emailBody = `${caseRow.business_name} 지원신청 서류의 넥스트랩 검수가 완료되었습니다.\n진흥원 콘솔에서 서류(컨설팅 결과보고서·지원신청서·사업자등록증·공사업체 서류)를 확인하고 승인/반려해 주세요.\nhttps://restart.poclab.kr/institution/cases/${caseId}`;
    for (const u of institutions ?? []) {
      await queueNotification(supabase, { caseId, recipientId: u.id, triggerEvent: 'reviewed' });
      const phone = u.phone ? normalizePhone(u.phone) : null;
      if (phone) {
        try {
          await sendSms(phone, smsText);
        } catch {
          /* 문자 실패는 검수 완료에 영향 없음 */
        }
      }
      if (u.email) {
        try {
          await sendEmail(u.email, emailSubject, emailBody);
        } catch {
          /* 이메일 실패는 검수 완료에 영향 없음 */
        }
      }
    }
  } else {
    // 보완요청: 상태를 application_drafted 로 되돌려 멘토가 재작성 후 다시 송신하게 한다.
    const { data: updated } = await supabase
      .from('cases')
      .update({ status: 'application_drafted' })
      .eq('id', caseId)
      .eq('status', 'under_review')
      .select('id');
    if (!updated || updated.length === 0) {
      return { ok: false, error: '이미 처리되었습니다.' };
    }
    await supabase.from('case_status_history').insert({
      case_id: caseId,
      from_status: 'under_review',
      to_status: 'application_drafted',
      changed_by: reviewerId,
      note: comment ? `넥스트랩 보완요청: ${comment}` : '넥스트랩 보완요청',
    });
    // 담당 멘토에게 보완요청 알림
    const { data: assign } = await supabase
      .from('mentor_assignments')
      .select('mentor_id')
      .eq('case_id', caseId)
      .eq('is_active', true)
      .maybeSingle();
    if (assign) {
      await queueNotification(supabase, {
        caseId,
        recipientId: assign.mentor_id,
        triggerEvent: 'revision_requested',
      });
    }
  }

  await logAudit(supabase, {
    actorId: reviewerId,
    action: 'case.review',
    entityType: 'cases',
    entityId: caseId,
    metadata: { result },
  });
  return { ok: true, caseId };
}

/**
 * 워크플로우 8단계: 진흥원 승인/반려. approvals INSERT-only.
 * 승인 → approved(통보 큐), 반려 → rejected(사유 필수, 보완 후 재진입 가능).
 */
export async function approveOrRejectApplication(
  caseId: string,
  approverId: string,
  result: 'approved' | 'rejected',
  reason: string | undefined,
): Promise<WorkflowResult> {
  if (result === 'rejected' && !reason) {
    return { ok: false, error: '반려 시 사유를 입력해야 합니다.' };
  }
  const supabase = createClient();
  const { data: caseRow } = await supabase
    .from('cases')
    .select('status, mentee_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!caseRow) return { ok: false, error: '케이스에 접근할 수 없습니다.' };
  if (caseRow.status !== 'reviewed') {
    return { ok: false, error: '넥스트랩 검수 완료 단계에서만 승인/반려할 수 있습니다.' };
  }

  // approvals INSERT-only (이력 보존)
  await supabase.from('approvals').insert({
    case_id: caseId,
    approval_type: 'support',
    approver_id: approverId,
    result,
    reason: reason ?? null,
  });

  const nextStatus = result === 'approved' ? 'approved' : 'rejected';
  const { data: updated } = await supabase
    .from('cases')
    .update({ status: nextStatus })
    .eq('id', caseId)
    .eq('status', 'reviewed')
    .select('id');
  if (!updated || updated.length === 0) {
    return { ok: false, error: '이미 처리되었습니다.' };
  }

  await supabase.from('case_status_history').insert({
    case_id: caseId,
    from_status: 'reviewed',
    to_status: nextStatus,
    changed_by: approverId,
    note: result === 'approved' ? '진흥원 승인' : `진흥원 반려: ${reason}`,
  });

  // 통보 큐 (넥스트랩·멘토·멘티)
  const recipients: string[] = [];
  const { data: staff } = await supabase.from('users').select('id').eq('role', 'nextlab');
  staff?.forEach((u) => recipients.push(u.id));
  const { data: assign } = await supabase
    .from('mentor_assignments')
    .select('mentor_id')
    .eq('case_id', caseId)
    .eq('is_active', true)
    .maybeSingle();
  if (assign) recipients.push(assign.mentor_id);
  if (caseRow.mentee_id) recipients.push(caseRow.mentee_id);
  for (const r of recipients) {
    await queueNotification(supabase, {
      caseId,
      recipientId: r,
      triggerEvent: result === 'approved' ? 'approved' : 'rejected',
    });
  }

  await logAudit(supabase, {
    actorId: approverId,
    action: 'case.approval',
    entityType: 'approvals',
    entityId: caseId,
    metadata: { approval_type: 'support', result },
  });
  return { ok: true, caseId };
}
