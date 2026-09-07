'use server';

import { revalidatePath } from 'next/cache';

import { getSessionProfile, getRealSessionProfile } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSolapiSms, solapiConfigured } from '@/lib/notifications/solapi';

export type SupplementResult = { ok: true } | { ok: false; error: string };

const PHASE_LABEL: Record<string, string> = {
  pre: '지원신청(사전)',
  post: '자금신청(사후)',
  general: '서류',
};

/** 요청자가 이 케이스에 보완 요청을 등록할 권한이 있는지 (운영진 또는 담당 멘토) */
async function canRequest(
  admin: ReturnType<typeof createAdminClient>,
  caseId: string,
  profile: { id: string; role: string },
  real?: { role: string } | null,
): Promise<boolean> {
  // 실제 스태프는 대행 중에도 자기 콘솔에서 보완요청을 계속 등록할 수 있어야 한다.
  if (real && (real.role === 'nextlab' || real.role === 'institution')) return true;
  if (profile.role === 'nextlab' || profile.role === 'institution') return true;
  if (profile.role === 'mentor') {
    const { data } = await admin
      .from('mentor_assignments')
      .select('id')
      .eq('case_id', caseId)
      .eq('mentor_id', profile.id)
      .eq('is_active', true)
      .maybeSingle();
    return !!data;
  }
  return false;
}

/** 운영진·담당 멘토: 멘티에게 보완 요청 등록 (+문자 알림) */
export async function createSupplementRequestAction(input: {
  caseId: string;
  phase: 'pre' | 'post' | 'general';
  message: string;
}): Promise<SupplementResult> {
  const profile = await getSessionProfile();
  const real = await getRealSessionProfile();
  if (!profile || !profile.is_active) return { ok: false, error: '인증이 필요합니다.' };

  const message = (input.message ?? '').trim();
  if (!message) return { ok: false, error: '요청 내용을 입력하세요.' };
  if (message.length > 500) return { ok: false, error: '요청 내용은 500자 이내로 입력하세요.' };

  const admin = createAdminClient();
  if (!(await canRequest(admin, input.caseId, profile, real))) {
    return { ok: false, error: '권한이 없습니다.' };
  }

  const { error } = await admin.from('supplement_requests').insert({
    case_id: input.caseId,
    phase: input.phase,
    message,
    created_by: profile.id,
    created_by_role: profile.role,
  });
  if (error) return { ok: false, error: error.message };

  // 멘티에게 문자 알림 (연락처 있고 연동된 경우)
  const { data: caseRow } = await admin
    .from('cases')
    .select('business_name, mentee_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (caseRow?.mentee_id && solapiConfigured()) {
    const { data: mentee } = await admin
      .from('users')
      .select('phone, is_active')
      .eq('id', caseRow.mentee_id)
      .maybeSingle();
    const phone = mentee?.phone ?? '';
    if (mentee?.is_active && phone.replace(/\D/g, '').length >= 10) {
      const label = PHASE_LABEL[input.phase] ?? '서류';
      const text = `[재기지원사업] ${caseRow.business_name} ${label} 보완 요청이 있습니다. 플랫폼에 로그인해 확인 후 서류를 보완해 주세요.\n- 요청: ${message.slice(0, 120)}`;
      await sendSolapiSms(phone, text, { senderIndex: 1 });
    }
  }

  // 감사기록의 실행자는 항상 '실제로 누른 사람'. 대행 중이면 명의(멘토)를 metadata 로 남긴다.
  const actingOnBehalf = !!real && real.id !== profile.id;
  await admin.from('audit_logs').insert({
    actor_id: real?.id ?? profile.id,
    action: 'supplement.request',
    entity_type: 'supplement_requests',
    entity_id: input.caseId,
    metadata: {
      phase: input.phase,
      by_role: profile.role,
      ...(actingOnBehalf ? { on_behalf_of: profile.id } : {}),
    },
  });

  revalidatePath('/mentee/dashboard');
  revalidatePath(`/mentor/cases/${input.caseId}`);
  revalidatePath(`/nextlab/cases/${input.caseId}`);
  return { ok: true };
}

/** 멘티(또는 운영진): 보완 요청 처리 완료로 닫기 */
export async function resolveSupplementRequestAction(id: string): Promise<SupplementResult> {
  // 스태프 판정은 실제 신원 기준 — 대행 신원이 개입하면 안 되는 순수 스태프/멘티 기능이다.
  const real = await getRealSessionProfile();
  const profile = real ?? (await getSessionProfile());
  if (!profile || !profile.is_active) return { ok: false, error: '인증이 필요합니다.' };
  if (!id) return { ok: false, error: '잘못된 요청입니다.' };

  const admin = createAdminClient();
  const { data: req } = await admin
    .from('supplement_requests')
    .select('case_id, resolved_at')
    .eq('id', id)
    .maybeSingle();
  if (!req) return { ok: false, error: '요청을 찾을 수 없습니다.' };

  // 권한: 운영진 또는 해당 케이스 멘티
  let allowed = profile.role === 'nextlab' || profile.role === 'institution';
  if (!allowed && profile.role === 'mentee') {
    const { data: c } = await admin
      .from('cases')
      .select('mentee_id')
      .eq('id', req.case_id)
      .maybeSingle();
    allowed = c?.mentee_id === profile.id;
  }
  if (!allowed) return { ok: false, error: '권한이 없습니다.' };

  await admin
    .from('supplement_requests')
    .update({ resolved_at: new Date().toISOString(), resolved_by: profile.id })
    .eq('id', id)
    .is('resolved_at', null);

  revalidatePath('/mentee/dashboard');
  revalidatePath(`/mentor/cases/${req.case_id}`);
  revalidatePath(`/nextlab/cases/${req.case_id}`);
  return { ok: true };
}
