import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/workflow/audit';
import { queueNotification } from '@/lib/workflow/notifications';
import { uploadFile } from '@/lib/storage/files';
import { renderTemplate, htmlToPdf } from '@/lib/documents/render';
import { paymentTemplateKey, buildPaymentData, getTemplateHtml } from '@/lib/documents/templates';
import { getCaseSignatureImages, signaturePlaceholders } from '@/lib/data/signatures';
import type { WorkflowResult } from '@/lib/workflow/cases';

// 워크플로우 10단계(멘티 시공·지급증빙 등록: notified → execution_docs_submitted)는
// 자금신청(사후) 신청단위 시스템(submitPostSupportAction)으로 일원화되어 제거되었다.

export interface PaymentDraftInput {
  caseId: string;
  drafterId: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
}

const PAYMENT_DRAFTABLE = ['execution_docs_submitted', 'payment_application_drafted'] as const;

/** 워크플로우 10단계: 넥스트랩 지급신청서 작성 + PDF (→ payment_application_drafted) */
export async function draftPaymentApplication(input: PaymentDraftInput): Promise<WorkflowResult> {
  const supabase = createClient();
  const { data: caseRow } = await supabase
    .from('cases')
    .select('*')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!caseRow) return { ok: false, error: '케이스에 접근할 수 없습니다.' };
  if (!(PAYMENT_DRAFTABLE as readonly string[]).includes(caseRow.status)) {
    return { ok: false, error: '지금은 지급신청서를 작성할 수 없는 단계입니다.' };
  }

  // 완료보고서 제출기한 = 지금 + 3개월
  const due = new Date();
  due.setMonth(due.getMonth() + 3);
  const reportDueDate = due.toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from('payment_applications')
    .select('id')
    .eq('case_id', input.caseId)
    .maybeSingle();
  const row = {
    bank_name: input.bankName,
    account_number: input.accountNumber,
    account_holder: input.accountHolder,
    amount: input.amount,
    report_due_date: reportDueDate,
    drafted_by: input.drafterId,
  };
  if (existing) {
    await supabase.from('payment_applications').update(row).eq('id', existing.id);
  } else {
    await supabase.from('payment_applications').insert({ case_id: input.caseId, ...row });
  }

  // 지급신청서 PDF (best-effort)
  const { data: type } = await supabase
    .from('support_types')
    .select('*')
    .eq('id', caseRow.support_type_id)
    .single();
  const { data: contractor } = await supabase
    .from('contractors')
    .select('*')
    .eq('case_id', input.caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  // 컨설턴트(멘토) 자동 연동 — 붙임4/7 추천인 영역
  const { data: assign } = await supabase
    .from('mentor_assignments')
    .select('mentor_id')
    .eq('case_id', input.caseId)
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

  if (type) {
    try {
      const html = await getTemplateHtml(paymentTemplateKey(type.code));
      if (html) {
        const rendered = renderTemplate(html, {
          ...buildPaymentData(
            caseRow,
            type,
            contractor,
            {
              amount: input.amount,
              bankName: input.bankName,
              accountNumber: input.accountNumber,
              accountHolder: input.accountHolder,
              reportDueDate,
              costExclVat: input.amount,
            },
            { consultantName, consultantPhone },
          ),
          ...signaturePlaceholders(await getCaseSignatureImages(input.caseId)),
        });
        const pdf = await htmlToPdf(rendered);
        const meta = await uploadFile('documents', input.caseId, pdf, 'application/pdf', 'pdf');
        await supabase.from('documents').insert({
          case_id: input.caseId,
          doc_key: 'payment_application',
          doc_name: '지급신청서(생성)',
          storage_path: meta.storagePath,
          sha256: meta.sha256,
          uploaded_by: input.drafterId,
          file_size: meta.size,
          mime_type: 'application/pdf',
        });
        await supabase
          .from('payment_applications')
          .update({ generated_pdf_path: meta.storagePath })
          .eq('case_id', input.caseId);
      }
    } catch {
      // PDF 실패 무시 (재생성 가능)
    }
  }

  const { data: updated } = await supabase
    .from('cases')
    .update({ status: 'payment_application_drafted' })
    .eq('id', input.caseId)
    .in('status', [...PAYMENT_DRAFTABLE])
    .select('id');
  if (!updated || updated.length === 0) {
    return { ok: false, error: '이미 처리되었습니다.' };
  }
  await supabase.from('case_status_history').insert({
    case_id: input.caseId,
    from_status: caseRow.status,
    to_status: 'payment_application_drafted',
    changed_by: input.drafterId,
    note: '지급신청서 작성',
  });
  await logAudit(supabase, {
    actorId: input.drafterId,
    action: 'case.payment_drafted',
    entityType: 'cases',
    entityId: input.caseId,
  });

  const { data: institutions } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'institution');
  for (const u of institutions ?? []) {
    await queueNotification(supabase, {
      caseId: input.caseId,
      recipientId: u.id,
      triggerEvent: 'payment_application_drafted',
    });
  }
  return { ok: true, caseId: input.caseId };
}

/** 워크플로우 11단계: 진흥원 지급승인 → payment_approved(종료) / 반려 → 재작성 */
export async function approvePayment(
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
  if (caseRow.status !== 'payment_application_drafted') {
    return { ok: false, error: '지급신청서 작성 완료 단계에서만 승인/반려할 수 있습니다.' };
  }

  await supabase.from('approvals').insert({
    case_id: caseId,
    approval_type: 'payment',
    approver_id: approverId,
    result,
    reason: reason ?? null,
  });

  const nextStatus = result === 'approved' ? 'payment_approved' : 'execution_docs_submitted';
  const { data: updated } = await supabase
    .from('cases')
    .update({ status: nextStatus })
    .eq('id', caseId)
    .eq('status', 'payment_application_drafted')
    .select('id');
  if (!updated || updated.length === 0) {
    return { ok: false, error: '이미 처리되었습니다.' };
  }
  await supabase.from('case_status_history').insert({
    case_id: caseId,
    from_status: 'payment_application_drafted',
    to_status: nextStatus,
    changed_by: approverId,
    note: result === 'approved' ? '지급 승인 (종료)' : `지급 반려: ${reason}`,
  });
  await logAudit(supabase, {
    actorId: approverId,
    action: 'case.payment_approval',
    entityType: 'approvals',
    entityId: caseId,
    metadata: { approval_type: 'payment', result },
  });

  // 통보
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
      triggerEvent: result === 'approved' ? 'payment_approved' : 'rejected',
    });
  }
  return { ok: true, caseId };
}
