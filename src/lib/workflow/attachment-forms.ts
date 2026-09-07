import { createClient } from '@/lib/supabase/server';
import { uploadFile } from '@/lib/storage/files';
import { renderTemplate, htmlToPdf } from '@/lib/documents/render';
import {
  buildAttachmentData,
  ATTACHMENT_FORM_KEYS,
  type AttachmentFormKey,
} from '@/lib/documents/templates';
import { getCaseSignatureImages, signaturePlaceholders } from '@/lib/data/signatures';
import { deleteCaseDocsByKey } from '@/lib/data/case-docs';
import { logAudit } from '@/lib/workflow/audit';
import type { WorkflowResult } from '@/lib/workflow/cases';

/**
 * 동의·확약 계열 붙임서식(붙임2/3/6/8/11/12) PDF 생성.
 * 케이스 업체 식별정보를 서식에 주입해 PDF 를 만들고 documents(doc_key=form_<key>)로 저장.
 * 동의 체크·서명·상세사유는 인쇄 후 수기 처리 전제.
 */
export async function generateAttachmentForm(
  caseId: string,
  templateKey: AttachmentFormKey,
  actorId: string,
): Promise<WorkflowResult> {
  if (!ATTACHMENT_FORM_KEYS.includes(templateKey)) {
    return { ok: false, error: '허용되지 않은 서식입니다.' };
  }

  const supabase = createClient();

  const { data: caseRow } = await supabase.from('cases').select('*').eq('id', caseId).maybeSingle();
  if (!caseRow) return { ok: false, error: '케이스에 접근할 수 없습니다.' };

  const { data: contractor } = await supabase
    .from('contractors')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: template } = await supabase
    .from('document_templates')
    .select('name, html_content')
    .eq('template_key', templateKey)
    .maybeSingle();
  if (!template?.html_content) return { ok: false, error: '서식 템플릿이 없습니다.' };

  // 서명 순서 보장: 신청업체(멘티) 서명은 멘토링 일지 단계에서 캡처된다.
  // 서명란이 있는 동의·확약 서식을 서명 전에 생성하면 (인) 공란으로 인쇄되므로,
  // 사전서식(붙임1 사업신청서·붙임2 추진계획서)을 제외하고 멘티 서명 선존재를 강제한다.
  const signatures = await getCaseSignatureImages(caseId);
  const preSignatureForms: AttachmentFormKey[] = ['business_application', 'business_plan'];
  if (!preSignatureForms.includes(templateKey) && !signatures.applicant) {
    return {
      ok: false,
      error: '신청업체(멘티) 서명이 아직 없습니다. 멘토링 일지에서 서명을 완료한 뒤 생성하세요.',
    };
  }

  try {
    const rendered = renderTemplate(template.html_content, {
      ...buildAttachmentData(caseRow, contractor),
      ...signaturePlaceholders(signatures),
    });
    const pdf = await htmlToPdf(rendered);
    const meta = await uploadFile('documents', caseId, pdf, 'application/pdf', 'pdf');
    // 교체/상호배타: 같은 서식의 기존 생성본을 대체하고, 확약서는 '업로드본'도 제거해 둘 다 남지 않게 한다.
    await deleteCaseDocsByKey(caseId, `form_${templateKey}`);
    if (templateKey === 'pledge_no_overlap') {
      await deleteCaseDocsByKey(caseId, 'pledge_no_overlap_file');
    }
    const { error: insErr } = await supabase.from('documents').insert({
      case_id: caseId,
      doc_key: `form_${templateKey}`,
      doc_name: `${template.name}(생성)`,
      storage_path: meta.storagePath,
      sha256: meta.sha256,
      uploaded_by: actorId,
      file_size: meta.size,
      mime_type: 'application/pdf',
    });
    // insert 실패를 삼키면 '생성 성공인데 서식이 없는' 상태가 된다 → 표면화
    if (insErr) return { ok: false, error: `서식 등록 실패: ${insErr.message}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[attachment-form] 생성 실패', { templateKey, caseId, message });
    return { ok: false, error: `서식 생성 실패: ${message.slice(0, 200)}` };
  }

  await logAudit(supabase, {
    actorId,
    action: 'case.attachment_form',
    entityType: 'cases',
    entityId: caseId,
    metadata: { form: templateKey },
  });

  return { ok: true, caseId };
}
