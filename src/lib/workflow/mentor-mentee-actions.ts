'use server';

import { revalidatePath } from 'next/cache';

import { mentorOrNull, MENTOR_ONLY_ERROR, requireRole } from '@/lib/auth/guards';
import { getImpersonation } from '@/lib/auth/impersonation';
import { logAudit } from '@/lib/workflow/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { phoneTempPassword } from '@/lib/auth/admin-accounts';
import { dataUrlToBuffer, uploadFile } from '@/lib/storage/files';
import { getCaseById, type CaseListItem } from '@/lib/data/cases';

export type MentorMenteeResult =
  | { ok: true; message?: string; tempPassword?: string }
  | { ok: false; error: string };

/** 담당 멘토가 배정된 케이스인지 + 케이스의 멘티 id 조회 (service_role) */
async function assertMentorCaseMentee(
  caseId: string,
  mentorId: string,
): Promise<{ menteeId: string; menteePhone: string | null } | null> {
  const admin = createAdminClient();
  const { data: assign } = await admin
    .from('mentor_assignments')
    .select('id')
    .eq('case_id', caseId)
    .eq('mentor_id', mentorId)
    .eq('is_active', true)
    .maybeSingle();
  if (!assign) return null;
  const { data: caseRow } = await admin
    .from('cases')
    .select('mentee_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!caseRow?.mentee_id) return null;
  const { data: mentee } = await admin
    .from('users')
    .select('phone')
    .eq('id', caseRow.mentee_id)
    .maybeSingle();
  return { menteeId: caseRow.mentee_id, menteePhone: mentee?.phone ?? null };
}

/**
 * 멘토: 담당 멘티의 임시 비밀번호 재설정 (미팅 현장 지원용).
 * 임시비번 = 휴대폰 번호. 최초 로그인 시 비밀번호 변경을 다시 강제한다.
 */
export async function resetMenteePasswordAction(caseId: string): Promise<MentorMenteeResult> {
  const mentor = await mentorOrNull();
  if (!mentor) return { ok: false, error: MENTOR_ONLY_ERROR };
  // 자격증명 변경은 대행으로 대신 수행하지 않는다(실행자 부인방지). 넥스트랩은 회원관리에서 직접 처리.
  const imp = await getImpersonation();
  if (imp && imp.target.id === mentor.id) {
    return {
      ok: false,
      error:
        '대행 중에는 멘티 비밀번호를 재설정할 수 없습니다. 넥스트랩 회원관리에서 직접 처리하세요.',
    };
  }
  const target = await assertMentorCaseMentee(caseId, mentor.id);
  if (!target) return { ok: false, error: '담당 케이스의 멘티 계정을 찾을 수 없습니다.' };

  const admin = createAdminClient();
  const tempPassword = phoneTempPassword(target.menteePhone);
  const { error: pwError } = await admin.auth.admin.updateUserById(target.menteeId, {
    password: tempPassword,
  });
  if (pwError) return { ok: false, error: '비밀번호 재설정에 실패했습니다.' };

  await admin
    .from('users')
    .update({ must_change_password: true, updated_at: new Date().toISOString() })
    .eq('id', target.menteeId);
  await logAudit(admin, {
    actorId: mentor.id,
    action: 'mentee.password_reset_by_mentor',
    entityType: 'users',
    entityId: target.menteeId,
    metadata: { case_id: caseId },
  });

  return {
    ok: true,
    message: '멘티 임시 비밀번호를 재설정했습니다. 멘티에게 전달하세요.',
    tempPassword,
  };
}

/**
 * 멘토: 미팅 확인 서명 캡처 (멘티 서명).
 * signer_type='mentee' 로 저장되어 멘토링보고서·지원신청서 등 서식의 신청업체(대표자)
 * 서명 자리에 자동 재사용된다(getCaseSignatureImages).
 */
export async function captureMeetingSignatureAction(
  caseId: string,
  signatureDataUrl: string,
): Promise<MentorMenteeResult> {
  const mentor = await mentorOrNull();
  if (!mentor) return { ok: false, error: MENTOR_ONLY_ERROR };
  const target = await assertMentorCaseMentee(caseId, mentor.id);
  if (!target) return { ok: false, error: '담당 케이스가 아닙니다.' };

  const parsed = dataUrlToBuffer(signatureDataUrl);
  if (!parsed) return { ok: false, error: '서명 이미지를 확인하세요.' };

  const admin = createAdminClient();
  try {
    const meta = await uploadFile('signatures', caseId, parsed.buffer, parsed.mimeType, 'png');
    await admin.from('signatures').insert({
      case_id: caseId,
      signer_type: 'mentee',
      document_type: 'meeting_confirm',
      storage_path: meta.storagePath,
      sha256: meta.sha256,
    });
  } catch {
    return { ok: false, error: '서명 저장에 실패했습니다. 다시 시도하세요.' };
  }

  await admin.from('audit_logs').insert({
    actor_id: mentor.id,
    action: 'mentee.meeting_signature',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: {},
  });

  revalidatePath(`/mentor/cases/${caseId}`);
  revalidatePath('/mentor/tasks');
  return { ok: true, message: '미팅 확인 서명이 저장되었습니다. 서식 작성 시 자동 반영됩니다.' };
}

/** 멘토: 담당 케이스 상세 조회 (세부보기 팝업용). RLS 로 담당 케이스만 열람. */
export async function getMentorCaseDetailAction(caseId: string): Promise<CaseListItem | null> {
  // 열람 전용 — 넥스트랩·진흥원의 회원 화면보기에서도 호출된다.
  await requireRole(['mentor', 'nextlab', 'institution']);
  return getCaseById(caseId);
}
