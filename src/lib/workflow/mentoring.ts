import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/workflow/audit';
import { queueNotification } from '@/lib/workflow/notifications';
import { uploadFile, moveFile, dataUrlToBuffer, sha256Hex } from '@/lib/storage/files';
import { logRequirement } from '@/lib/workflow/mentor-tasks';
import { mentoringPhotoDocKey } from '@/lib/data/mentoring-logs';
import type { WorkflowResult } from '@/lib/workflow/cases';

/**
 * 브라우저가 photos 버킷 `_staging/…` 로 직접 올린 현장사진을 케이스 폴더로 이관하고
 * documents(doc_key=`mentoring_photo:{logId}`) 에 회차별로 태깅해 기록한다.
 * (File 을 서버 액션으로 넘기면 저장되지 않던 문제 → 스토리지 직접 업로드 + 경로만 전달)
 */
async function finalizeMentoringPhotos(
  caseId: string,
  uploadedBy: string,
  stagingPaths: string[],
  logId: string,
): Promise<void> {
  if (stagingPaths.length === 0) return;
  const admin = createAdminClient();
  for (const stagingPath of stagingPaths) {
    if (!stagingPath.startsWith('_staging/') || stagingPath.includes('..')) continue;
    const basename = stagingPath.split('/').pop();
    if (!basename) continue;
    const { data: blob } = await admin.storage.from('photos').download(stagingPath);
    if (!blob) continue;
    const buffer = Buffer.from(await blob.arrayBuffer());
    const dest = `${caseId}/${basename}`;
    try {
      await moveFile('photos', stagingPath, dest);
    } catch {
      continue;
    }
    await admin.from('documents').insert({
      case_id: caseId,
      // 회차(log)별 태깅 — 회차 미리보기·수정 시 해당 회차 사진만 노출
      doc_key: mentoringPhotoDocKey(logId),
      doc_name: '멘토링 사진',
      storage_path: dest,
      sha256: sha256Hex(buffer),
      uploaded_by: uploadedBy,
      file_size: buffer.byteLength,
      mime_type: blob.type || 'image/jpeg',
    });
  }
}

/** 멘토가 담당하는 케이스인지 확인 */
async function assertMentorOfCase(caseId: string, mentorId: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from('mentor_assignments')
    .select('id')
    .eq('case_id', caseId)
    .eq('mentor_id', mentorId)
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}

/** 워크플로우 3단계: 멘티 확인·연락 (mentor_assigned → contacted) */
export async function recordContact(caseId: string, mentorId: string): Promise<WorkflowResult> {
  if (!(await assertMentorOfCase(caseId, mentorId))) {
    return { ok: false, error: '담당 멘토가 아닙니다.' };
  }
  const supabase = createClient();
  const { data: updated } = await supabase
    .from('cases')
    .update({ status: 'contacted' })
    .eq('id', caseId)
    .eq('status', 'mentor_assigned')
    .select('id');
  if (!updated || updated.length === 0) {
    return { ok: false, error: '멘토 배정 단계에서만 연락 기록이 가능합니다.' };
  }
  await supabase.from('case_status_history').insert({
    case_id: caseId,
    from_status: 'mentor_assigned',
    to_status: 'contacted',
    changed_by: mentorId,
    note: '멘티 확인·연락',
  });
  await logAudit(supabase, {
    actorId: mentorId,
    action: 'case.contact',
    entityType: 'cases',
    entityId: caseId,
  });
  return { ok: true, caseId };
}

export interface MentoringLogSubmission {
  caseId: string;
  mentorId: string;
  visitedAt: string;
  durationMinutes?: number;
  place?: string;
  topic?: string;
  difficulties?: string;
  content: string;
  result?: string;
  /** 브라우저가 photos 버킷 `_staging/…` 로 직접 올린 현장사진 경로 */
  photoPaths: string[];
  mentorSignatureDataUrl: string;
  menteeSignatureDataUrl: string;
}

/**
 * 워크플로우 4단계: 멘토링 일지 작성.
 * 사진·서명 Storage 업로드 + SHA-256 저장, mentoring_logs 기록, contacted/mentor_assigned → log_completed.
 */
export async function submitMentoringLog(input: MentoringLogSubmission): Promise<WorkflowResult> {
  if (!(await assertMentorOfCase(input.caseId, input.mentorId))) {
    return { ok: false, error: '담당 멘토가 아닙니다.' };
  }

  const mentorSig = dataUrlToBuffer(input.mentorSignatureDataUrl);
  const menteeSig = dataUrlToBuffer(input.menteeSignatureDataUrl);
  if (!mentorSig || !menteeSig) {
    return { ok: false, error: '멘토·멘티 서명을 모두 입력하세요.' };
  }

  const supabase = createClient();

  // 유형별 최대 회차 확인 (경영개선 최대 3 · 폐업정리 최대 2)
  const { data: caseRow } = await supabase
    .from('cases')
    .select('support_type_id')
    .eq('id', input.caseId)
    .maybeSingle();
  let maxLogs = 3;
  if (caseRow) {
    const { data: st } = await supabase
      .from('support_types')
      .select('code')
      .eq('id', caseRow.support_type_id)
      .maybeSingle();
    maxLogs = logRequirement(st?.code ?? null).max;
  }
  const { count: existingLogs } = await supabase
    .from('mentoring_logs')
    .select('id', { count: 'exact', head: true })
    .eq('case_id', input.caseId);
  if ((existingLogs ?? 0) >= maxLogs) {
    return {
      ok: false,
      error: `이 유형은 멘토링 일지를 최대 ${maxLogs}회까지 작성할 수 있습니다.`,
    };
  }

  // 일지 기록 (먼저 생성해 logId 확보 → 사진을 회차별로 태깅)
  const { data: insertedLog, error: logErr } = await supabase
    .from('mentoring_logs')
    .insert({
      case_id: input.caseId,
      mentor_id: input.mentorId,
      visited_at: input.visitedAt,
      duration_minutes: input.durationMinutes ?? null,
      place: input.place ?? null,
      topic: input.topic ?? null,
      difficulties: input.difficulties ?? null,
      content: input.content,
      result: input.result ?? null,
    })
    .select('id')
    .single();
  if (logErr || !insertedLog) {
    return { ok: false, error: '멘토링 일지 저장에 실패했습니다. 다시 시도하세요.' };
  }

  // 현장사진: 브라우저가 올린 파일을 케이스 폴더로 이관 + 회차(log)별 태깅 기록
  await finalizeMentoringPhotos(input.caseId, input.mentorId, input.photoPaths, insertedLog.id);

  // 서명 업로드 + signatures 기록
  for (const [type, sig] of [
    ['mentor', mentorSig],
    ['mentee', menteeSig],
  ] as const) {
    const meta = await uploadFile('signatures', input.caseId, sig.buffer, sig.mimeType, 'png');
    await supabase.from('signatures').insert({
      case_id: input.caseId,
      signer_type: type,
      document_type: 'mentoring_log',
      storage_path: meta.storagePath,
      sha256: meta.sha256,
    });
  }

  const logNo = (existingLogs ?? 0) + 1;

  // 상태 전이 (첫 일지에서만 mentor_assigned/contacted → log_completed).
  // 2회차 이상은 상태를 바꾸지 않고 일지만 추가한다(에러 아님).
  const { data: transitioned } = await supabase
    .from('cases')
    .update({ status: 'log_completed' })
    .eq('id', input.caseId)
    .in('status', ['mentor_assigned', 'contacted'])
    .select('id');
  const firstLog = !!(transitioned && transitioned.length > 0);

  if (firstLog) {
    await supabase.from('case_status_history').insert({
      case_id: input.caseId,
      from_status: 'contacted',
      to_status: 'log_completed',
      changed_by: input.mentorId,
      note: '멘토링 일지 작성(1회차)',
    });

    // 넥스트랩에 일지완료 알림 큐 (첫 일지 · notifications insert 는 staff 권한 필요 → admin)
    const admin = createAdminClient();
    const { data: nextlabs } = await admin.from('users').select('id').eq('role', 'nextlab');
    for (const u of nextlabs ?? []) {
      await queueNotification(admin, {
        caseId: input.caseId,
        recipientId: u.id,
        triggerEvent: 'log_completed',
      });
    }
  }

  await logAudit(supabase, {
    actorId: input.mentorId,
    action: 'case.mentoring_log',
    entityType: 'cases',
    entityId: input.caseId,
    metadata: { photos: input.photoPaths.length, logNo },
  });

  return { ok: true, caseId: input.caseId };
}

export interface MentoringLogEdit {
  logId: string;
  mentorId: string;
  visitedAt: string;
  durationMinutes?: number;
  place?: string;
  topic?: string;
  difficulties?: string;
  content: string;
  result?: string;
  /** 추가 사진(선택) — 브라우저가 photos 버킷 `_staging/…` 로 직접 올린 경로 */
  photoPaths: string[];
  /** 재서명(선택) — 넣으면 최신 서명으로 반영, 비우면 기존 유지 */
  mentorSignatureDataUrl?: string;
  menteeSignatureDataUrl?: string;
}

/**
 * 작성된 멘토링 일지 수정.
 * 본문(방문일시·장소·주제·내용 등)을 갱신하고, 선택적으로 사진 추가·재서명을 반영한다.
 * (서명은 케이스 단위라 재서명 시 최신 서명이 서식에 사용된다)
 */
export async function updateMentoringLog(input: MentoringLogEdit): Promise<WorkflowResult> {
  const supabase = createClient();
  const { data: log } = await supabase
    .from('mentoring_logs')
    .select('id, case_id')
    .eq('id', input.logId)
    .maybeSingle();
  if (!log) return { ok: false, error: '멘토링 일지를 찾을 수 없습니다.' };
  if (!(await assertMentorOfCase(log.case_id, input.mentorId))) {
    return { ok: false, error: '담당 멘토가 아닙니다.' };
  }

  const admin = createAdminClient();
  const { error: upErr } = await admin
    .from('mentoring_logs')
    .update({
      visited_at: input.visitedAt,
      duration_minutes: input.durationMinutes ?? null,
      place: input.place ?? null,
      topic: input.topic ?? null,
      difficulties: input.difficulties ?? null,
      content: input.content,
      result: input.result ?? null,
    })
    .eq('id', input.logId);
  if (upErr) return { ok: false, error: upErr.message };

  // 추가 사진(선택): 케이스 폴더로 이관 + 해당 회차(log)로 태깅
  await finalizeMentoringPhotos(log.case_id, input.mentorId, input.photoPaths, input.logId);

  // 재서명(선택) — 새 서명이 들어오면 최신 서명으로 반영
  for (const [type, dataUrl] of [
    ['mentor', input.mentorSignatureDataUrl] as const,
    ['mentee', input.menteeSignatureDataUrl] as const,
  ]) {
    if (!dataUrl) continue;
    const sig = dataUrlToBuffer(dataUrl);
    if (!sig) continue;
    const meta = await uploadFile('signatures', log.case_id, sig.buffer, sig.mimeType, 'png');
    await admin.from('signatures').insert({
      case_id: log.case_id,
      signer_type: type,
      document_type: 'mentoring_log',
      storage_path: meta.storagePath,
      sha256: meta.sha256,
    });
  }

  await logAudit(supabase, {
    actorId: input.mentorId,
    action: 'case.mentoring_log_update',
    entityType: 'mentoring_logs',
    entityId: input.logId,
  });

  return { ok: true, caseId: log.case_id };
}

/** 멘토링 일지 삭제 (담당 멘토만). 일지 행만 삭제하며 다시 작성할 수 있다. */
export async function deleteMentoringLog(
  logId: string,
  mentorId: string,
): Promise<WorkflowResult> {
  const supabase = createClient();
  const { data: log } = await supabase
    .from('mentoring_logs')
    .select('id, case_id')
    .eq('id', logId)
    .maybeSingle();
  if (!log) return { ok: false, error: '멘토링 일지를 찾을 수 없습니다.' };
  if (!(await assertMentorOfCase(log.case_id, mentorId))) {
    return { ok: false, error: '담당 멘토가 아닙니다.' };
  }

  const admin = createAdminClient();
  const { error } = await admin.from('mentoring_logs').delete().eq('id', logId);
  if (error) return { ok: false, error: error.message };

  await logAudit(supabase, {
    actorId: mentorId,
    action: 'case.mentoring_log_delete',
    entityType: 'mentoring_logs',
    entityId: logId,
  });

  return { ok: true, caseId: log.case_id };
}

// SHA-256 재노출 (호출부 편의)
export { sha256Hex };
