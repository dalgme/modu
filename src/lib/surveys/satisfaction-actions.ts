'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';

export type SurveyOpenResult = { ok: true } | { ok: false; error: string };

/**
 * 운영사: 케이스 만족도 조사 수동 개시 — [만족도 생성] 버튼 (P20).
 * 멘티 화면(만족도 조사 탭·대시보드 할 일)에 즉시 노출되고, 1주일 미응답 시 자동 리마인드 문자 대상이 된다.
 */
export async function openCaseSurveyAction(caseId: string): Promise<SurveyOpenResult> {
  const actor = await realRoleOrNull(['nextlab']);
  if (!actor) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'surveys');
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, program_id, status, survey_opened_at').eq('id', caseId).maybeSingle();
  if (!c || c.program_id !== ctx.programId) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  if (c.status === 'withdrawn') return { ok: false, error: '중도 종료된 케이스에는 만족도 조사를 열 수 없습니다.' };
  if (c.survey_opened_at) return { ok: false, error: '이미 만족도 조사가 열려 있습니다.' };

  const { error } = await admin.from('cases').update({ survey_opened_at: new Date().toISOString() }).eq('id', caseId).is('survey_opened_at', null);
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({
    actor_id: actor.id,
    program_id: ctx.programId,
    action: 'survey.case_opened',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { manual: true },
  });
  revalidatePath('/nextlab/roster');
  return { ok: true };
}
