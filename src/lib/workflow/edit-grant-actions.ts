'use server';

import { revalidatePath } from 'next/cache';

import { requireNextlab } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveEditGrant } from '@/lib/data/edit-grants';
import type { WorkflowResult } from '@/lib/workflow/cases';

const DEFAULT_HOURS = 24;
const MAX_HOURS = 72;

function revalidate(caseId: string) {
  revalidatePath(`/nextlab/cases/${caseId}`);
  revalidatePath(`/institution/cases/${caseId}`);
  revalidatePath(`/mentor/cases/${caseId}`);
  revalidatePath('/nextlab/dashboard');
  revalidatePath('/institution/dashboard');
  revalidatePath('/nextlab/board');
  revalidatePath('/institution/board');
}

/**
 * 임시 수정권한 개설 (넥스트랩 독점).
 * '넥스트랩 검수 완료(reviewed)' 단계에서만, 대상(넥스트랩/멘토)을 지정해 한시적으로 수정 허용.
 * 별도 시간 지정이 없으면 24시간 후 자동 만료. 기존 활성 권한은 먼저 마감하고 새로 개설한다.
 */
export async function openEditGrantAction(
  caseId: string,
  target: 'nextlab' | 'mentor',
  hours?: number,
): Promise<WorkflowResult> {
  const profile = await requireNextlab();
  if (target !== 'nextlab' && target !== 'mentor') {
    return { ok: false, error: '대상을 확인하세요.' };
  }
  const admin = createAdminClient();

  const { data: caseRow } = await admin
    .from('cases')
    .select('status')
    .eq('id', caseId)
    .maybeSingle();
  if (!caseRow) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  if (caseRow.status !== 'reviewed') {
    return { ok: false, error: '넥스트랩 검수 완료 단계에서만 임시 수정권한을 열 수 있습니다.' };
  }

  const h = Math.min(Math.max(1, Math.round(hours ?? DEFAULT_HOURS)), MAX_HOURS);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + h * 3600 * 1000).toISOString();

  // 기존 활성 권한 마감
  await admin
    .from('case_edit_grants')
    .update({ closed_at: now.toISOString(), closed_by: profile.id })
    .eq('case_id', caseId)
    .is('closed_at', null);

  const { error } = await admin.from('case_edit_grants').insert({
    case_id: caseId,
    target,
    granted_by: profile.id,
    granted_at: now.toISOString(),
    expires_at: expiresAt,
    note: `대상=${target === 'nextlab' ? '넥스트랩' : '담당 멘토'}, ${h}시간`,
  });
  if (error) return { ok: false, error: error.message };

  await admin.from('audit_logs').insert({
    actor_id: profile.id,
    action: 'case.edit_grant_open',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { target, hours: h, expires_at: expiresAt },
  });

  revalidate(caseId);
  return { ok: true, caseId };
}

/** 임시 수정권한 마감 (넥스트랩 독점) — 24시간 이전 수동 마감 */
export async function closeEditGrantAction(caseId: string): Promise<WorkflowResult> {
  const profile = await requireNextlab();
  const admin = createAdminClient();

  const active = await getActiveEditGrant(caseId);
  if (!active) return { ok: false, error: '열려 있는 임시 수정권한이 없습니다.' };

  const { data: updated } = await admin
    .from('case_edit_grants')
    .update({ closed_at: new Date().toISOString(), closed_by: profile.id })
    .eq('id', active.id)
    .is('closed_at', null)
    .select('id');
  if (!updated || updated.length === 0) {
    return { ok: false, error: '이미 마감되었습니다.' };
  }

  await admin.from('audit_logs').insert({
    actor_id: profile.id,
    action: 'case.edit_grant_close',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { grant_id: active.id, manual: true },
  });

  revalidate(caseId);
  return { ok: true, caseId };
}
