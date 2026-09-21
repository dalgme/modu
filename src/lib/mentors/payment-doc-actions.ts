'use server';

import { revalidatePath } from 'next/cache';

import { roleOrNull, getRealSessionProfile } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { moveFile } from '@/lib/storage/files';

export type PaymentDocKind = 'resume' | 'bankbook' | 'idCard';

const COLUMN: Record<PaymentDocKind, { path: string; name: string; at: string; label: string }> = {
  resume: { path: 'resume_path', name: 'resume_file_name', at: 'resume_uploaded_at', label: '이력서' },
  bankbook: { path: 'bankbook_path', name: 'bankbook_file_name', at: 'bankbook_uploaded_at', label: '통장사본' },
  idCard: { path: 'id_card_path', name: 'id_card_file_name', at: 'id_card_uploaded_at', label: '신분증사본' },
};

export type PaymentDocResult = { ok: true } | { ok: false; error: string };

/**
 * 멘토 본인 지급서류 제출(업로드) — 이력서·통장사본·신분증사본.
 * 파일은 브라우저에서 documents 버킷 `_staging/` 에 올린 뒤 이 액션이 검증·이관한다.
 * 수령 체크(운영사 확인)는 별개 — 여기서는 건드리지 않는다.
 */
export async function uploadPaymentDocAction(
  kind: PaymentDocKind,
  staged: { stagingPath: string; fileName: string },
): Promise<PaymentDocResult> {
  const profile = await roleOrNull(['mentor']);
  if (!profile) return { ok: false, error: '멘토만 제출할 수 있습니다.' };
  const col = COLUMN[kind];
  if (!col) return { ok: false, error: '서류 종류가 올바르지 않습니다.' };
  if (!staged?.stagingPath?.startsWith('_staging/')) return { ok: false, error: '업로드 파일이 올바르지 않습니다.' };

  const real = await getRealSessionProfile();
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };

  const admin = createAdminClient();
  const ext = staged.fileName.includes('.') ? staged.fileName.split('.').pop()!.toLowerCase().slice(0, 8) : 'bin';
  const dest = `payment-docs/${ctx.programId}/${profile.id}/${kind}-${Date.now()}.${ext}`;
  try {
    await moveFile('documents', staged.stagingPath, dest);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '파일 저장에 실패했습니다.' };
  }

  // 기존 파일 정리 후 경로 교체 (수동 upsert — unique(program_id, user_id))
  const { data: existing } = await admin
    .from('mentor_payment_docs')
    .select('id, resume_path, bankbook_path, id_card_path')
    .eq('program_id', ctx.programId)
    .eq('user_id', profile.id)
    .maybeSingle();
  const prevPath = existing ? (existing[col.path as 'resume_path'] as string | null) : null;

  const now = new Date().toISOString();
  const patch =
    kind === 'resume'
      ? { resume_path: dest, resume_file_name: staged.fileName, resume_uploaded_at: now }
      : kind === 'bankbook'
        ? { bankbook_path: dest, bankbook_file_name: staged.fileName, bankbook_uploaded_at: now }
        : { id_card_path: dest, id_card_file_name: staged.fileName, id_card_uploaded_at: now };
  const { error } = existing
    ? await admin.from('mentor_payment_docs').update(patch).eq('id', existing.id)
    : await admin.from('mentor_payment_docs').insert({ program_id: ctx.programId, user_id: profile.id, ...patch });
  if (error) return { ok: false, error: `저장 실패: ${error.message}` };
  if (prevPath) await admin.storage.from('documents').remove([prevPath]);

  await admin.from('audit_logs').insert({
    actor_id: real?.id ?? profile.id,
    program_id: ctx.programId,
    action: 'mentor.payment_doc_upload',
    entity_type: 'users',
    entity_id: profile.id,
    metadata: { kind, file_name: staged.fileName, ...(real && real.id !== profile.id ? { on_behalf_of: profile.id, via: 'view-as' } : {}) },
  });

  revalidatePath('/mentor/profile');
  revalidatePath('/nextlab/roster');
  return { ok: true };
}
