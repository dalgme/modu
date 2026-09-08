'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createCampaign, notifyCampaignTargets, setCampaignStatus, submitTokenResponse, type AudienceInput } from '@/lib/surveys/campaigns';
import { createAdminClient } from '@/lib/supabase/admin';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function operator(): Promise<{ id: string; programId: string; supportTypeId: string | null } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'surveys');
  if (denied) return { error: denied };
  return { id: profile.id, programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? null };
}

async function campaignInProgram(campaignId: string, programId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('survey_campaigns').select('program_id').eq('id', campaignId).maybeSingle();
  return !!data && data.program_id === programId;
}

const createSchema = z.object({
  templateId: z.string().uuid('조사 양식을 선택하세요.'),
  title: z.string().trim().min(1, '조사 이름을 입력하세요.').max(120),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
  startsAt: z.string().trim().optional().transform((v) => v || null),
  endsAt: z.string().trim().optional().transform((v) => v || null),
  audienceKind: z.enum(['role', 'users']),
  roles: z.array(z.enum(['mentee', 'mentor'])).default([]),
  groupId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
  userIds: z.array(z.string().uuid()).default([]),
});

/** 조사 개설 — 대상자 스냅샷 생성 */
export async function createCampaignAction(input: unknown): Promise<Result<{ id: string; targets: number }>> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const d = parsed.data;
  const audience: AudienceInput =
    d.audienceKind === 'users'
      ? { kind: 'users', userIds: d.userIds }
      : { kind: 'role', roles: d.roles.length ? d.roles : ['mentee'], supportTypeId: d.groupId };
  if (d.audienceKind === 'users' && d.userIds.length === 0) return { ok: false, error: '개별 대상자를 1명 이상 선택하세요.' };
  const r = await createCampaign({
    programId: op.programId,
    supportTypeId: op.supportTypeId,
    templateId: d.templateId,
    title: d.title,
    description: d.description,
    startsAt: d.startsAt ? new Date(d.startsAt).toISOString() : null,
    endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : null,
    audience,
    actorId: op.id,
  });
  if (r.ok) revalidatePath('/nextlab/surveys');
  return r;
}

/** 초대/독려 문자 발송 (onlyUnresponded=true 면 미참여자만) */
export async function notifyCampaignAction(campaignId: string, onlyUnresponded: boolean, message?: string): Promise<Result<{ sent: number; failed: number; skipped: number }>> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  if (!(await campaignInProgram(campaignId, op.programId))) return { ok: false, error: '이 행사의 조사가 아닙니다.' };
  const r = await notifyCampaignTargets(campaignId, op.id, { onlyUnresponded, message });
  if (r.ok) revalidatePath(`/nextlab/surveys/${campaignId}`);
  return r;
}

export async function setCampaignStatusAction(campaignId: string, status: 'open' | 'closed'): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  if (!(await campaignInProgram(campaignId, op.programId))) return { ok: false, error: '이 행사의 조사가 아닙니다.' };
  const r = await setCampaignStatus(campaignId, status, op.id);
  if (r.ok) {
    revalidatePath('/nextlab/surveys');
    revalidatePath(`/nextlab/surveys/${campaignId}`);
  }
  return r;
}

/** 토큰 응답 제출 — 로그인 불필요(문자 링크), 플랫폼 내에서도 같은 경로 */
export async function respondCampaignAction(token: string, answers: Record<string, unknown>, channel: 'web' | 'sms'): Promise<Result> {
  return submitTokenResponse(token, answers, channel === 'sms' ? 'sms' : 'web');
}

/** 종결 만족도 미응답 멘티 독려 문자 */
export async function remindSatisfactionAction(message?: string): Promise<Result<{ sent: number; failed: number; skipped: number }>> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const { remindSatisfaction } = await import('@/lib/surveys/satisfaction');
  const r = await remindSatisfaction(op.programId, op.supportTypeId, op.id, message);
  if (r.ok) revalidatePath('/nextlab/surveys');
  return r;
}
