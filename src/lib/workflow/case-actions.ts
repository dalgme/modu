'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { requireInstitution, requireNextlab, requireStaff, requireUser } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { moveFile, createCaseScopedSignedUrl, sha256Hex } from '@/lib/storage/files';
import { toStoredPhone } from '@/lib/auth/identifier';
import {
  normalizeBusinessName,
  normalizePersonName,
} from '@/lib/documents/parse-application-pdf';
import { caseFormSchema, assignMentorSchema } from '@/lib/validations/case';
import {
  createCase,
  assignMentor,
  reassignMentor,
  recallMentor,
  type WorkflowResult,
  type CreateCaseResult,
} from '@/lib/workflow/cases';
import type { CaseFormInput } from '@/lib/validations/case';

// 신청서 PDF 파싱·스테이징은 Route Handler(/api/institution/cases/parse-application)로 이동.

/** 신청서 PDF 자동채움 라우트가 반환한 스테이징 정보 (케이스 등록 시 첨부) */
export interface ApplicationStaging {
  stagingPath: string;
  fileName: string;
  size: number;
  sha256: string;
  mimeType: string;
}

/**
 * 스테이징된 신청서 PDF 를 케이스 폴더로 이관하고 documents 에 첨부(doc_key='application_pdf').
 * 실패해도 케이스 등록 자체는 유지한다(첨부만 누락).
 */
async function attachApplicationPdf(
  caseId: string,
  app: ApplicationStaging,
  actorId: string,
): Promise<void> {
  // 스테이징 경로만 허용 (임의 케이스 파일을 자기 케이스로 이동하는 조작 차단)
  if (!app.stagingPath.startsWith('_staging/')) return;
  const basename = app.stagingPath.split('/').pop();
  if (!basename) return;
  const dest = `${caseId}/${basename}`;

  await moveFile('documents', app.stagingPath, dest);

  const admin = createAdminClient();
  // 신청서 원본 PDF 는 '제출 이력'이므로 재등록해도 이전 제출본을 지우지 않고 보존한다(운영 방침).
  // 열람은 항상 최신본이 뜬다 — getApplicationSourcePdfUrl 이 created_at desc + limit 1 로 조회하고,
  // 목록/상세는 존재 여부(hasApplicationPdf)만 쓰므로 여러 건이 있어도 화면이 흔들리지 않는다.
  // (그래서 이 키는 documents_singleton_doc_key_idx 유니크 인덱스 대상에서도 제외한다)
  const { error: insErr } = await admin.from('documents').insert({
    case_id: caseId,
    doc_key: 'application_pdf',
    doc_name: app.fileName || '사업신청서.pdf',
    storage_path: dest,
    sha256: app.sha256,
    uploaded_by: actorId,
    file_size: app.size,
    mime_type: app.mimeType || 'application/pdf',
  });
  if (insErr) console.error('[case] application_pdf insert failed', insErr.message);
}

/** 진흥원: 케이스 등록 (워크플로우 1단계). 멘티 계정 자동 발급 + 신청서 PDF 첨부 포함. */
export async function registerCase(
  input: CaseFormInput,
  application?: ApplicationStaging,
): Promise<CreateCaseResult> {
  const profile = await requireInstitution();

  const parsed = caseFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }

  const supabase = createClient();
  const { data: type } = await supabase
    .from('support_types')
    .select('code')
    .eq('id', parsed.data.support_type_id)
    .maybeSingle();
  if (!type) {
    return { ok: false, error: '유효하지 않은 지원유형입니다.' };
  }

  const result = await createCase({
    ...parsed.data,
    createdBy: profile.id,
    supportTypeCode: type.code,
  });

  // 신청서 PDF 원본 첨부 (등록 성공 시). 실패는 무시 — 케이스는 유지.
  if (result.ok && application) {
    try {
      await attachApplicationPdf(result.caseId, application, profile.id);
    } catch {
      // 첨부 실패 무시
    }
  }

  if (result.ok) revalidatePath('/institution/dashboard');
  return result;
}

/**
 * 케이스에 첨부된 사업신청서 원본 PDF 의 signed URL (팝업 열람).
 * RLS 로 열람 권한을 검증(진흥원·넥스트랩 전체, 멘토=배정, 멘티=본인)한 뒤 경로 범위 검증까지 수행.
 */
export async function getApplicationSourcePdfUrl(caseId: string): Promise<string | null> {
  await requireUser();
  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('case_id', caseId)
    .eq('doc_key', 'application_pdf')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.storage_path) return null;
  return createCaseScopedSignedUrl('documents', caseId, data.storage_path, 300);
}

/** 넥스트랩이 브라우저에서 직접 업로드한 '업체별 사업추진 계획서' 스테이징 정보 */
export interface BusinessPlanStaging {
  stagingPath: string;
  fileName: string;
  mimeType: string;
}

/**
 * 넥스트랩: '업체별 사업추진 계획서' 첨부 (doc_key='business_plan_attachment').
 * 스테이징에 올라온 파일을 케이스 폴더로 이관하고 documents 에 첨부한다.
 * 해시·크기는 서버에서 스테이징 파일을 내려받아 계산한다(요청 본문 한도 우회).
 */
export async function attachBusinessPlanAction(
  caseId: string,
  staging: BusinessPlanStaging,
): Promise<WorkflowResult> {
  const profile = await requireNextlab();

  if (!staging.stagingPath.startsWith('_staging/') || staging.stagingPath.includes('..')) {
    return { ok: false, error: '잘못된 업로드 경로입니다.' };
  }
  const basename = staging.stagingPath.split('/').pop();
  if (!basename) return { ok: false, error: '잘못된 업로드 경로입니다.' };

  const admin = createAdminClient();

  // 스테이징 파일을 내려받아 해시·크기 계산
  const { data: blob, error: dlError } = await admin.storage
    .from('documents')
    .download(staging.stagingPath);
  if (dlError || !blob) {
    return { ok: false, error: '업로드된 파일을 확인할 수 없습니다. 다시 시도하세요.' };
  }
  const buffer = Buffer.from(await blob.arrayBuffer());
  const sha256 = sha256Hex(buffer);
  const size = buffer.byteLength;

  const dest = `${caseId}/${basename}`;
  try {
    await moveFile('documents', staging.stagingPath, dest);
  } catch {
    return { ok: false, error: '파일 첨부에 실패했습니다. 다시 시도하세요.' };
  }

  const { error: insertError } = await admin.from('documents').insert({
    case_id: caseId,
    doc_key: 'business_plan_attachment',
    doc_name: staging.fileName || '업체별 사업추진 계획서',
    storage_path: dest,
    sha256,
    uploaded_by: profile.id,
    file_size: size,
    mime_type: staging.mimeType || 'application/octet-stream',
  });
  if (insertError) return { ok: false, error: insertError.message };

  await admin.from('audit_logs').insert({
    actor_id: profile.id,
    action: 'case.attach_business_plan',
    entity_type: 'documents',
    entity_id: caseId,
    metadata: {},
  });

  revalidatePath(`/nextlab/cases/${caseId}`);
  return { ok: true, caseId };
}

/**
 * 케이스에 첨부된 '업체별 사업추진 계획서'의 signed URL (팝업 열람).
 * RLS 로 열람 권한을 검증한 뒤 경로 범위 검증까지 수행.
 */
export async function getBusinessPlanSourceUrl(caseId: string): Promise<string | null> {
  await requireUser();
  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('case_id', caseId)
    .eq('doc_key', 'business_plan_attachment')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.storage_path) return null;
  return createCaseScopedSignedUrl('documents', caseId, data.storage_path, 300);
}

export interface IntakeFields {
  business_name: string;
  owner_name: string;
  business_reg_no: string;
  phone: string;
  address: string;
  email: string;
  business_type: string;
  item: string;
  opened_at: string;
  employee_count: string;
}

export type IntakeSaveResult =
  | { ok: true; assigned: boolean }
  | { ok: false; error: string };

/**
 * 넥스트랩: 접수내용 확인·편집 저장 + (선택) 멘토 배정.
 *  - 멘티 기본정보 수정(이름·회사명·연락처 등 정규화 후 저장) + 신청 내용 요약(intake_note).
 *  - 연동된 멘티 계정의 이름·휴대폰도 동기화(로그인 아이디 = 이름+뒷4자리 유지).
 *  - mentorId 지정 시 assignMentor 로 배정(registered → mentor_assigned).
 */
export async function saveIntakeReviewAction(input: {
  caseId: string;
  fields: IntakeFields;
  intakeNote: string;
  mentorId?: string;
}): Promise<IntakeSaveResult> {
  const profile = await requireNextlab();
  const f = input.fields;

  const businessName = normalizeBusinessName(f.business_name) ?? f.business_name.trim();
  const ownerName = normalizePersonName(f.owner_name) ?? f.owner_name.trim();
  const phone = toStoredPhone(f.phone) ?? f.phone.trim();
  const businessRegNo = f.business_reg_no.trim();
  const address = f.address.trim();
  if (!businessName || !ownerName || !businessRegNo || !phone || !address) {
    return { ok: false, error: '업체명·대표자·사업자번호·연락처·주소는 필수입니다.' };
  }

  const employeeCount = f.employee_count.trim() ? Number(f.employee_count.replace(/\D/g, '')) : null;

  const admin = createAdminClient();
  // intake_note 는 타입 생성 전(0035) 컬럼이라 loosely-typed 클라이언트로 업데이트한다.
  const { data: updated, error } = await (admin as unknown as SupabaseClient)
    .from('cases')
    .update({
      business_name: businessName,
      owner_name: ownerName,
      business_reg_no: businessRegNo,
      phone,
      address,
      email: f.email.trim() || null,
      business_type: f.business_type.trim() || null,
      item: f.item.trim() || null,
      opened_at: f.opened_at.trim() || null,
      employee_count: employeeCount != null && !Number.isNaN(employeeCount) ? employeeCount : null,
      intake_note: input.intakeNote.trim() || null,
    })
    .eq('id', input.caseId)
    .select('mentee_id')
    .single();
  if (error) return { ok: false, error: error.message };

  // 멘티 계정 이름·휴대폰 동기화 (로그인 아이디 정합)
  const menteeId = (updated as { mentee_id?: string | null } | null)?.mentee_id;
  if (menteeId) {
    await admin.from('users').update({ name: ownerName, phone }).eq('id', menteeId);
  }

  let assigned = false;
  if (input.mentorId) {
    const res = await assignMentor(input.caseId, input.mentorId, profile.id);
    if (!res.ok) return { ok: false, error: res.error };
    assigned = true;
  }

  revalidatePath('/nextlab/dashboard');
  revalidatePath(`/nextlab/cases/${input.caseId}`);
  return { ok: true, assigned };
}

/** 넥스트랩: 멘토 배정 (워크플로우 2단계). 배정 권한은 넥스트랩 전용. */
export async function assignMentorAction(
  caseId: string,
  mentorId: string,
): Promise<WorkflowResult> {
  const profile = await requireNextlab();

  const parsed = assignMentorSchema.safeParse({ caseId, mentorId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }

  const result = await assignMentor(parsed.data.caseId, parsed.data.mentorId, profile.id);
  if (result.ok) {
    revalidatePath('/nextlab/dashboard');
    revalidatePath(`/nextlab/cases/${caseId}`);
  }
  return result;
}

/**
 * 넥스트랩: 멘토 재배정. 이미 배정된 케이스의 담당 멘토를 다른 멘토로 교체한다.
 * 멘토 사정으로 담당자 변경이 필요한 경우 사용(넥스트랩 전용).
 */
export async function reassignMentorAction(
  caseId: string,
  newMentorId: string,
): Promise<WorkflowResult> {
  const profile = await requireNextlab();

  const parsed = assignMentorSchema.safeParse({ caseId, mentorId: newMentorId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }

  const result = await reassignMentor(parsed.data.caseId, parsed.data.mentorId, profile.id);
  if (result.ok) {
    revalidatePath('/nextlab/dashboard');
    revalidatePath(`/nextlab/cases/${caseId}`);
    revalidatePath(`/mentor/dashboard`);
  }
  return result;
}

/**
 * 넥스트랩: 멘토 배정 회수. 배정을 취소하고 케이스를 대상자 등록 단계로 되돌린다.
 * 이후 진흥원이 내용을 수정·재업로드해 다시 멘토 배정을 요청할 수 있다(넥스트랩 전용).
 */
export async function recallMentorAction(caseId: string): Promise<WorkflowResult> {
  const profile = await requireNextlab();
  const result = await recallMentor(caseId, profile.id);
  if (result.ok) {
    revalidatePath('/nextlab/dashboard');
    revalidatePath(`/nextlab/cases/${caseId}`);
    revalidatePath('/institution/dashboard');
    revalidatePath(`/institution/cases/${caseId}`);
    revalidatePath('/mentor/dashboard');
  }
  return result;
}

/**
 * 진흥원: 회수됐거나 아직 미배정(registered)인 케이스의 내용 수정 + (선택) 신청서 PDF 재첨부.
 * 저장 후에도 registered 상태이므로 넥스트랩 멘토 배정 대기 목록에 그대로 유지된다.
 * registered 단계에서만 허용한다.
 */
export async function updateRegisteredCaseAction(input: {
  caseId: string;
  fields: IntakeFields;
  supportTypeId?: string;
  application?: ApplicationStaging;
}): Promise<WorkflowResult> {
  // 진흥원·넥스트랩(운영) 모두 회수된 케이스를 재등록할 수 있다.
  const profile = await requireStaff();

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('cases')
    .select('status, mentee_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!existing) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  if (existing.status !== 'registered') {
    return { ok: false, error: '대상자 등록 단계에서만 수정할 수 있습니다.' };
  }

  const f = input.fields;
  const businessName = normalizeBusinessName(f.business_name) ?? f.business_name.trim();
  const ownerName = normalizePersonName(f.owner_name) ?? f.owner_name.trim();
  const phone = toStoredPhone(f.phone) ?? f.phone.trim();
  const businessRegNo = f.business_reg_no.trim();
  const address = f.address.trim();
  if (!businessName || !ownerName || !businessRegNo || !phone || !address) {
    return { ok: false, error: '업체명·대표자·사업자번호·연락처·주소는 필수입니다.' };
  }
  const employeeCount = f.employee_count.trim() ? Number(f.employee_count.replace(/\D/g, '')) : null;

  const update: Record<string, unknown> = {
    business_name: businessName,
    owner_name: ownerName,
    business_reg_no: businessRegNo,
    phone,
    address,
    email: f.email.trim() || null,
    business_type: f.business_type.trim() || null,
    item: f.item.trim() || null,
    opened_at: f.opened_at.trim() || null,
    employee_count: employeeCount != null && !Number.isNaN(employeeCount) ? employeeCount : null,
  };
  if (input.supportTypeId) update.support_type_id = input.supportTypeId;

  const { error } = await (admin as unknown as SupabaseClient)
    .from('cases')
    .update(update)
    .eq('id', input.caseId);
  if (error) return { ok: false, error: error.message };

  // 연동 멘티 계정 이름·휴대폰 동기화 (로그인 아이디 정합)
  if (existing.mentee_id) {
    await admin.from('users').update({ name: ownerName, phone }).eq('id', existing.mentee_id);
  }

  // 신청서 PDF 재첨부 (최신본이 우선 노출됨). 실패는 무시.
  if (input.application) {
    try {
      await attachApplicationPdf(input.caseId, input.application, profile.id);
    } catch {
      /* 첨부 실패 무시 — 내용 수정은 유지 */
    }
  }

  await admin.from('audit_logs').insert({
    actor_id: profile.id,
    action: 'case.reregister_edit',
    entity_type: 'cases',
    entity_id: input.caseId,
    metadata: { pdf_reuploaded: !!input.application },
  });

  revalidatePath('/institution/dashboard');
  revalidatePath(`/institution/cases/${input.caseId}`);
  revalidatePath('/nextlab/dashboard');
  revalidatePath(`/nextlab/cases/${input.caseId}`);
  return { ok: true, caseId: input.caseId };
}
