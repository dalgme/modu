'use server';

import { revalidatePath } from 'next/cache';

import { getSessionProfile, mentorOfCaseOrNull, realRoleOrNull, roleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { attachCaseDocument, deleteCaseDocument, setCaseDocumentVisibility } from '@/lib/workflow/case-documents';

type Result = { ok: true } | { ok: false; error: string };

function revalidate(caseId: string) {
  revalidatePath(`/nextlab/cases/${caseId}`);
  revalidatePath(`/institution/cases/${caseId}`);
  revalidatePath(`/mentor/cases/${caseId}`);
  revalidatePath('/mentee/dashboard');
  revalidatePath('/mentee/documents');
}

/** 첨부 권한: 운영사(행사 멤버) · 멘티 본인 케이스 · 담당 멘토 */
async function actorForCase(caseId: string): Promise<{ id: string; role: 'nextlab' | 'mentee' | 'mentor' } | null> {
  const staff = await realRoleOrNull(['nextlab']);
  if (staff) {
    const ctx = await contextOrNull(staff);
    const { data } = await createAdminClient().from('cases').select('program_id').eq('id', caseId).maybeSingle();
    if (ctx && data && data.program_id === ctx.programId) return { id: staff.id, role: 'nextlab' };
  }
  const mentee = await roleOrNull(['mentee']);
  if (mentee) {
    const { data } = await createAdminClient().from('cases').select('id').eq('id', caseId).eq('mentee_id', mentee.id).maybeSingle();
    if (data) return { id: mentee.id, role: 'mentee' };
  }
  const mentor = await mentorOfCaseOrNull(caseId);
  if (mentor) return { id: mentor.id, role: 'mentor' };
  return null;
}

export async function attachCaseDocumentAction(input: {
  caseId: string;
  staging: { stagingPath: string; fileName: string; mimeType: string };
  label?: string;
  mentorVisible: boolean;
  docKey?: string;
}): Promise<Result> {
  const actor = await actorForCase(input.caseId);
  if (!actor) return { ok: false, error: '이 케이스에 파일을 올릴 권한이 없습니다.' };
  const r = await attachCaseDocument({ caseId: input.caseId, actor, staging: input.staging, label: input.label, mentorVisible: input.mentorVisible, docKey: input.docKey });
  if (r.ok) revalidate(input.caseId);
  return r;
}

export async function setCaseDocumentVisibilityAction(caseId: string, docId: string, mentorVisible: boolean): Promise<Result> {
  const actor = await actorForCase(caseId);
  if (!actor || actor.role === 'mentor') return { ok: false, error: '공개 범위는 운영사 또는 멘티만 바꿀 수 있습니다.' };
  const r = await setCaseDocumentVisibility(docId, caseId, actor.id, mentorVisible);
  if (r.ok) revalidate(caseId);
  return r;
}

export async function deleteCaseDocumentAction(caseId: string, docId: string): Promise<Result> {
  const actor = await actorForCase(caseId);
  if (!actor) return { ok: false, error: '권한이 없습니다.' };
  const profile = await getSessionProfile();
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' };
  const r = await deleteCaseDocument(docId, caseId, { id: actor.id, role: actor.role });
  if (r.ok) revalidate(caseId);
  return r;
}
