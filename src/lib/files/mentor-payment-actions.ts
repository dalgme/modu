'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { getImpersonation } from '@/lib/auth/impersonation';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { moveFile, sha256Hex } from '@/lib/storage/files';
import { logAudit } from '@/lib/workflow/audit';
import { fileExt } from '@/lib/files/business-plan-match';
import { MENTOR_PAYMENT_MAX_BYTES, MENTOR_PAYMENT_MAX_FILES, mentorPaymentExtAllowed } from '@/lib/files/mentor-payment-shared';
import { clearMergedCache, isProgramMentor, loadMentorPaymentRows, MENTOR_PAYMENT_BUCKET, mentorPaymentFolder } from '@/lib/files/mentor-payment';

/**
 * 멘토 지급증빙 서류 등록·교체·삭제·순서 변경 (2026-09-30) — 운영사 전용, 실명 기준·대행 불가, `mentors.docs` 권한.
 * 파일은 브라우저가 documents 버킷 `_staging/` 에 올린 뒤(stageUpload) 이 액션이 검증·이관한다.
 * 행사 단위 저장 — 어느 라운드 화면에서 올려도 모든 라운드에 같은 파일이 보인다.
 */

export type StagedInput = { stagingPath: string; fileName: string; mimeType: string };
export type MentorPaymentResult = { ok: true; added: number; failed: { fileName: string; error: string }[] } | { ok: false; error: string };
type SimpleResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;

async function operator(): Promise<{ id: string; programId: string } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: '운영사 담당자만 실행할 수 있습니다.' };
  if (await getImpersonation()) return { error: '대행(화면 보기) 중에는 멘토 지급서류를 바꿀 수 없습니다. 대행을 끝내고 다시 시도하세요.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'mentors.docs');
  if (denied) return { error: denied };
  return { id: profile.id, programId: ctx.programId };
}

function revalidate() {
  revalidatePath('/nextlab/files');
  revalidatePath('/institution/mentors');
}

async function removeStaged(paths: string[]) {
  const ok = paths.filter((p) => p.startsWith('_staging/') && !p.includes('..'));
  if (ok.length) await createAdminClient().storage.from(MENTOR_PAYMENT_BUCKET).remove(ok);
}

/**
 * 지급서류 등록 (여러 파일 한 번에). replaceFileId 를 주면 그 파일을 새 파일 1개로 교체(같은 순서 자리) — "수정 등록".
 */
export async function uploadMentorPaymentFilesAction(input: { mentorId: string; files: StagedInput[]; replaceFileId?: string | null }): Promise<MentorPaymentResult> {
  const op = await operator();
  const stagedPaths = (input.files ?? []).map((f) => f?.stagingPath).filter((p): p is string => typeof p === 'string');
  if ('error' in op) {
    await removeStaged(stagedPaths);
    return { ok: false, error: op.error };
  }
  if (!UUID.test(input.mentorId ?? '') || !(await isProgramMentor(op.programId, input.mentorId))) {
    await removeStaged(stagedPaths);
    return { ok: false, error: '이 행사의 멘토가 아닙니다.' };
  }
  const files = input.files ?? [];
  if (files.length === 0) return { ok: false, error: '파일을 선택하세요.' };
  const replaceId = input.replaceFileId?.trim() || null;
  if (replaceId && files.length !== 1) {
    await removeStaged(stagedPaths);
    return { ok: false, error: '교체는 파일 1개로만 할 수 있습니다.' };
  }

  const admin = createAdminClient();
  const existing = await loadMentorPaymentRows(op.programId, input.mentorId);
  const replaced = replaceId ? existing.find((r) => r.id === replaceId) ?? null : null;
  if (replaceId && !replaced) {
    await removeStaged(stagedPaths);
    return { ok: false, error: '교체할 파일을 찾을 수 없습니다.' };
  }
  const room = MENTOR_PAYMENT_MAX_FILES - existing.length + (replaced ? 1 : 0);
  if (files.length > room) {
    await removeStaged(stagedPaths);
    return { ok: false, error: `멘토 1명당 파일은 최대 ${MENTOR_PAYMENT_MAX_FILES}개입니다 (지금 ${existing.length}개 등록됨).` };
  }

  const folder = mentorPaymentFolder(op.programId, input.mentorId);
  let nextOrder = existing.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
  const failed: { fileName: string; error: string }[] = [];
  const addedNames: string[] = [];
  for (const f of files) {
    const fileName = (f.fileName ?? '').normalize('NFC').trim().slice(0, 150) || '첨부파일';
    const fail = async (error: string) => {
      failed.push({ fileName, error });
      await removeStaged([f.stagingPath]);
    };
    if (!f.stagingPath?.startsWith('_staging/') || f.stagingPath.includes('..')) {
      failed.push({ fileName, error: '잘못된 업로드 경로입니다.' });
      continue;
    }
    if (!mentorPaymentExtAllowed(fileName)) {
      await fail('허용되지 않는 형식입니다 (PDF·JPG·PNG·HWP·HWPX·DOC·DOCX).');
      continue;
    }
    const { data: blob } = await admin.storage.from(MENTOR_PAYMENT_BUCKET).download(f.stagingPath);
    if (!blob) {
      failed.push({ fileName, error: '업로드된 파일을 확인할 수 없습니다.' });
      continue;
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (buffer.byteLength > MENTOR_PAYMENT_MAX_BYTES) {
      await fail('파일은 20MB 이하여야 합니다.');
      continue;
    }
    const dest = `${folder}/${randomUUID()}.${fileExt(fileName) || 'bin'}`;
    try {
      await moveFile(MENTOR_PAYMENT_BUCKET, f.stagingPath, dest);
    } catch {
      await fail('파일 이동에 실패했습니다.');
      continue;
    }
    const { error } = await admin.from('mentor_payment_files').insert({
      program_id: op.programId,
      mentor_id: input.mentorId,
      file_name: fileName,
      storage_path: dest,
      mime_type: f.mimeType || blob.type || 'application/octet-stream',
      file_size: buffer.byteLength,
      sha256: sha256Hex(buffer),
      sort_order: replaced ? replaced.sort_order : nextOrder++,
      uploaded_by: op.id,
    });
    if (error) {
      await admin.storage.from(MENTOR_PAYMENT_BUCKET).remove([dest]);
      failed.push({ fileName, error: `저장 실패: ${error.message}` });
      continue;
    }
    addedNames.push(fileName);
  }

  // 교체: 새 파일이 저장된 뒤에만 옛 파일 삭제
  if (replaced && addedNames.length === 1) {
    await admin.from('mentor_payment_files').delete().eq('id', replaced.id);
    await admin.storage.from(MENTOR_PAYMENT_BUCKET).remove([replaced.storage_path]);
  }
  if (addedNames.length > 0) {
    await clearMergedCache(op.programId, input.mentorId);
    await logAudit(admin, {
      actorId: op.id,
      programId: op.programId,
      action: replaced ? 'mentor_payment.replace' : 'mentor_payment.upload',
      entityType: 'users',
      entityId: input.mentorId,
      metadata: { files: addedNames.length, names: addedNames, ...(replaced ? { replaced: replaced.file_name } : {}), failed: failed.length },
    });
  }
  revalidate();
  return { ok: true, added: addedNames.length, failed };
}

/** 지급서류 한 건 삭제 (스토리지 파일 + 행) */
export async function deleteMentorPaymentFileAction(fileId: string): Promise<SimpleResult> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  if (!UUID.test(fileId ?? '')) return { ok: false, error: '잘못된 요청입니다.' };
  const admin = createAdminClient();
  const { data: row } = await admin.from('mentor_payment_files').select('id, program_id, mentor_id, file_name, storage_path').eq('id', fileId).maybeSingle();
  if (!row || row.program_id !== op.programId) return { ok: false, error: '파일을 찾을 수 없습니다.' };
  const { error } = await admin.from('mentor_payment_files').delete().eq('id', row.id);
  if (error) return { ok: false, error: `삭제 실패: ${error.message}` };
  await admin.storage.from(MENTOR_PAYMENT_BUCKET).remove([row.storage_path]);
  await clearMergedCache(op.programId, row.mentor_id);
  await logAudit(admin, { actorId: op.id, programId: op.programId, action: 'mentor_payment.delete', entityType: 'users', entityId: row.mentor_id, metadata: { file_id: row.id, name: row.file_name } });
  revalidate();
  return { ok: true };
}

/** 순서 변경 — orderedIds 는 그 멘토의 파일 id 전부(화면 순서) */
export async function reorderMentorPaymentFilesAction(mentorId: string, orderedIds: string[]): Promise<SimpleResult> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  if (!UUID.test(mentorId ?? '')) return { ok: false, error: '잘못된 요청입니다.' };
  const rows = await loadMentorPaymentRows(op.programId, mentorId);
  const ids = new Set(rows.map((r) => r.id));
  if (orderedIds.length !== rows.length || !orderedIds.every((id) => ids.has(id)) || new Set(orderedIds).size !== orderedIds.length) {
    return { ok: false, error: '파일 목록이 바뀌었습니다. 새로고침 후 다시 시도하세요.' };
  }
  const admin = createAdminClient();
  const now = new Date().toISOString();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin.from('mentor_payment_files').update({ sort_order: i + 1, updated_at: now }).eq('id', orderedIds[i]!).eq('program_id', op.programId);
    if (error) return { ok: false, error: `순서 저장 실패: ${error.message}` };
  }
  await clearMergedCache(op.programId, mentorId);
  await logAudit(admin, { actorId: op.id, programId: op.programId, action: 'mentor_payment.reorder', entityType: 'users', entityId: mentorId, metadata: { files: orderedIds.length } });
  revalidate();
  return { ok: true };
}
