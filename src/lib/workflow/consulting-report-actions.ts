'use server';

import { revalidatePath } from 'next/cache';

import { mentorOrNull, MENTOR_ONLY_ERROR, requireRole, realRoleOrNull } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCaseScopedSignedUrl, moveFile, sha256Hex } from '@/lib/storage/files';
import { isWebPreviewable } from '@/lib/utils/file-type';
import {
  generateConsultingReport,
  deleteExistingConsultingReports,
} from '@/lib/workflow/consulting-report';
import type { WorkflowResult } from '@/lib/workflow/cases';

export type SimpleResult = { ok: true } | { ok: false; error: string };

async function isMentorOfCase(
  admin: ReturnType<typeof createAdminClient>,
  caseId: string,
  mentorId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('mentor_assignments')
    .select('id')
    .eq('case_id', caseId)
    .eq('mentor_id', mentorId)
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}

/**
 * 컨설팅 결과보고서가 생성·업로드되면 '지원신청서 작성·접수(application_drafted)' 단계로 진입시킨다.
 * log_completed 단계에서만 전이(멱등) — 이미 이후 단계면 아무 것도 하지 않는다.
 */
async function enterApplicationDraftedIfLogCompleted(
  admin: ReturnType<typeof createAdminClient>,
  caseId: string,
  actorId: string,
): Promise<void> {
  const { data: updated } = await admin
    .from('cases')
    .update({ status: 'application_drafted' })
    .eq('id', caseId)
    .eq('status', 'log_completed')
    .select('id');
  if (updated && updated.length > 0) {
    await admin.from('case_status_history').insert({
      case_id: caseId,
      from_status: 'log_completed',
      to_status: 'application_drafted',
      changed_by: actorId,
      note: '컨설팅 결과보고서 생성 → 지원신청서 작성·접수 진입',
    });
  }
}

/** 멘토: 컨설팅 결과보고서 '웹작성 일지 병합' 생성 */
export async function generateConsultingReportAction(caseId: string): Promise<WorkflowResult> {
  const profile = await mentorOrNull();
  if (!profile) return { ok: false, error: MENTOR_ONLY_ERROR };
  const result = await generateConsultingReport(caseId, profile.id);
  if (result.ok) {
    await enterApplicationDraftedIfLogCompleted(createAdminClient(), caseId, profile.id);
    revalidatePath(`/mentor/cases/${caseId}`);
  }
  return result;
}

/**
 * 넥스트랩(검수 화면): 컨설팅 결과보고서 재생성.
 *
 * 2026-08-14 이전에 만들어진 보고서는 옛 로직이라 마지막 1회차만 담겨 있다. 검수 중 이런 파일을
 * 발견하면 담당 멘토를 거치지 않고 이 자리에서 전체 회차 병합본으로 교체할 수 있게 한다.
 * 보고서 명의(uploaded_by)는 담당 멘토로 유지하고, 실행자(넥스트랩)는 감사기록에 남긴다.
 */
export async function regenerateConsultingReportAction(caseId: string): Promise<WorkflowResult> {
  const staff = await realRoleOrNull(['nextlab']);
  if (!staff) return { ok: false, error: '넥스트랩만 재생성할 수 있습니다.' };

  const admin = createAdminClient();
  const { data: assign } = await admin
    .from('mentor_assignments')
    .select('mentor_id')
    .eq('case_id', caseId)
    .eq('is_active', true)
    .maybeSingle();
  if (!assign?.mentor_id) {
    return { ok: false, error: '담당 멘토가 배정되지 않은 케이스입니다.' };
  }

  const result = await generateConsultingReport(caseId, assign.mentor_id, {
    performedBy: staff.id,
  });
  if (result.ok) {
    revalidatePath(`/nextlab/cases/${caseId}`);
    revalidatePath(`/institution/cases/${caseId}`);
    revalidatePath(`/mentor/cases/${caseId}`);
  }
  return result;
}

/**
 * 멘토: 완성한 컨설팅 결과보고서 '파일 업로드'(웹생성 대신).
 * 브라우저가 documents 버킷 _staging 에 올린 경로를 받아 케이스 폴더로 이관 + documents 기록.
 */
export async function uploadConsultingReportAction(
  caseId: string,
  staging: { stagingPath: string; fileName: string; mimeType: string },
): Promise<SimpleResult> {
  const profile = await mentorOrNull();
  if (!profile) return { ok: false, error: MENTOR_ONLY_ERROR };
  const admin = createAdminClient();
  if (!(await isMentorOfCase(admin, caseId, profile.id))) {
    return { ok: false, error: '담당 멘토가 아닙니다.' };
  }
  if (!staging.stagingPath.startsWith('_staging/') || staging.stagingPath.includes('..')) {
    return { ok: false, error: '잘못된 업로드 경로입니다.' };
  }
  const basename = staging.stagingPath.split('/').pop();
  if (!basename) return { ok: false, error: '잘못된 업로드 경로입니다.' };

  const { data: blob, error: dlError } = await admin.storage
    .from('documents')
    .download(staging.stagingPath);
  if (dlError || !blob) return { ok: false, error: '업로드된 파일을 확인할 수 없습니다.' };
  const buffer = Buffer.from(await blob.arrayBuffer());

  const dest = `${caseId}/${basename}`;
  try {
    await moveFile('documents', staging.stagingPath, dest);
  } catch {
    return { ok: false, error: '파일 업로드에 실패했습니다. 다시 시도하세요.' };
  }

  // 중복 방지: 기존 컨설팅 결과보고서를 삭제하고 새 업로드본으로 교체
  await deleteExistingConsultingReports(caseId);

  const { error: insErr } = await admin.from('documents').insert({
    case_id: caseId,
    doc_key: 'consulting_report',
    doc_name: staging.fileName || '컨설팅 결과보고서(업로드)',
    storage_path: dest,
    sha256: sha256Hex(buffer),
    uploaded_by: profile.id,
    file_size: buffer.byteLength,
    mime_type: staging.mimeType || 'application/octet-stream',
  });
  if (insErr) return { ok: false, error: insErr.message };

  await enterApplicationDraftedIfLogCompleted(admin, caseId, profile.id);
  revalidatePath(`/mentor/cases/${caseId}`);
  return { ok: true };
}

/** 생성·업로드된 컨설팅 결과보고서 목록 (열람·다운로드) */
export async function listConsultingReports(caseId: string): Promise<
  {
    id: string;
    name: string;
    url: string | null;
    downloadUrl: string | null;
    previewable: boolean;
  }[]
> {
  // 열람 전용 — 담당 멘토 외에 넥스트랩·진흥원(검수/회원 화면보기)도 조회할 수 있어야 한다.
  await requireRole(['mentor', 'nextlab', 'institution']);
  const admin = createAdminClient();
  const { data } = await admin
    .from('documents')
    .select('id, doc_name, storage_path, mime_type')
    .eq('case_id', caseId)
    .eq('doc_key', 'consulting_report')
    .order('created_at', { ascending: false });
  const rows = data ?? [];
  const [views, downloads] = await Promise.all([
    Promise.all(
      rows.map((d) => createCaseScopedSignedUrl('documents', caseId, d.storage_path, 600)),
    ),
    Promise.all(
      rows.map((d) =>
        createCaseScopedSignedUrl('documents', caseId, d.storage_path, 600, d.doc_name || true),
      ),
    ),
  ]);
  return rows.map((d, i) => ({
    id: d.id,
    name: d.doc_name ?? '컨설팅 결과보고서',
    url: views[i] ?? null,
    downloadUrl: downloads[i] ?? null,
    previewable: isWebPreviewable(d.mime_type, d.storage_path),
  }));
}

/** 생성된 컨설팅 결과보고서 PDF 의 signed URL (최신 1건) */
export async function getConsultingReportPdfUrl(caseId: string): Promise<string | null> {
  if (!(await mentorOrNull())) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('case_id', caseId)
    .eq('doc_key', 'consulting_report')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.storage_path) return null;
  return createCaseScopedSignedUrl('documents', caseId, data.storage_path, 300);
}
