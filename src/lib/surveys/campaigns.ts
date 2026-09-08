import 'server-only';

import { randomBytes } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendSolapiSms } from '@/lib/notifications/solapi';
import { resolveSmsCredentials } from '@/lib/sms/secrets';
import { aggregateAnswers, validateAnswers, type QuestionAggregate, type SurveyQuestionRow } from '@/lib/surveys/validate';
import type { Json, Tables } from '@/types/database';

/**
 * 조사 캠페인 (2026-09-08 요건) — 만족도 외 사전선호도·중간 만족도 등 여러 [조사]를
 * 행사 전체 / 그룹 / 개별 구성원 대상으로 기간을 정해 진행한다.
 *  - 대상자는 생성 시점 스냅샷(`survey_campaign_targets`) — 문자로만 응답해도 미참여자를 항상 파악한다.
 *  - 응답 경로: 플랫폼 내(할 일 카드) + 문자 링크. 둘 다 같은 토큰 페이지(`/s/{token}`)로 들어와 채널만 기록이 다르다.
 */
export type Campaign = Tables<'survey_campaigns'>;
export type CampaignTarget = Tables<'survey_campaign_targets'>;

export type AudienceInput =
  | { kind: 'role'; roles: ('mentee' | 'mentor')[]; supportTypeId?: string | null }
  | { kind: 'users'; userIds: string[] };

const token = () => randomBytes(16).toString('base64url');

/** 대상자 해석 — 행사 소속(program_members.role) 기준. 그룹 지정 시 멘티 = 그 그룹 케이스 보유자, 멘토 = 그룹 명부/배정. */
async function resolveAudience(programId: string, input: AudienceInput): Promise<{ userId: string; role: 'mentee' | 'mentor' | 'institution' | 'nextlab'; supportTypeId: string | null }[]> {
  const admin = createAdminClient();
  if (input.kind === 'users') {
    const { data } = await admin.from('program_members').select('user_id, role').eq('program_id', programId).eq('is_active', true).in('user_id', input.userIds);
    return (data ?? []).map((m) => ({ userId: m.user_id, role: m.role as 'mentee' | 'mentor', supportTypeId: null }));
  }
  const groupId = input.supportTypeId ?? null;
  const { data: members } = await admin.from('program_members').select('user_id, role').eq('program_id', programId).eq('is_active', true).in('role', input.roles);
  let out = (members ?? []).map((m) => ({ userId: m.user_id, role: m.role as 'mentee' | 'mentor', supportTypeId: null as string | null }));
  if (groupId) {
    const [{ data: cases }, { data: roster }] = await Promise.all([
      admin.from('cases').select('mentee_id').eq('support_type_id', groupId).not('mentee_id', 'is', null),
      admin.from('support_type_members').select('user_id').eq('support_type_id', groupId).eq('is_active', true),
    ]);
    const inGroup = new Set<string>([...(cases ?? []).map((c) => c.mentee_id as string), ...(roster ?? []).map((r) => r.user_id)]);
    out = out.filter((m) => inGroup.has(m.userId)).map((m) => ({ ...m, supportTypeId: groupId }));
  }
  return out;
}

export async function createCampaign(input: {
  programId: string;
  supportTypeId: string | null;
  templateId: string;
  title: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  audience: AudienceInput;
  actorId: string;
}): Promise<{ ok: true; id: string; targets: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: tpl } = await admin.from('survey_templates').select('id, program_id').eq('id', input.templateId).maybeSingle();
  if (!tpl || tpl.program_id !== input.programId) return { ok: false, error: '이 행사의 조사 양식이 아닙니다.' };
  const audience = await resolveAudience(input.programId, input.audience);
  if (audience.length === 0) return { ok: false, error: '대상자가 없습니다. 대상 범위를 확인하세요.' };
  const { data: users } = await admin.from('users').select('id, name, phone').in('id', audience.map((a) => a.userId));
  const uById = new Map((users ?? []).map((u) => [u.id, u]));

  const { data: created, error } = await admin
    .from('survey_campaigns')
    .insert({
      program_id: input.programId,
      support_type_id: input.audience.kind === 'role' ? (input.audience.supportTypeId ?? input.supportTypeId) : input.supportTypeId,
      template_id: input.templateId,
      title: input.title,
      description: input.description,
      starts_at: input.startsAt ?? new Date().toISOString(),
      ends_at: input.endsAt,
      status: 'open',
      created_by: input.actorId,
    })
    .select('id')
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? '조사 생성 실패' };

  const rows = audience.map((a) => {
    const u = uById.get(a.userId);
    return { campaign_id: created.id, user_id: a.userId, name: u?.name ?? '', phone: u?.phone ?? null, role: a.role, support_type_id: a.supportTypeId, token: token() };
  });
  const { error: tErr } = await admin.from('survey_campaign_targets').insert(rows);
  if (tErr) {
    await admin.from('survey_campaigns').delete().eq('id', created.id);
    return { ok: false, error: tErr.message };
  }
  await admin.from('audit_logs').insert({ actor_id: input.actorId, program_id: input.programId, action: 'survey.campaign_created', entity_type: 'survey_campaigns', entity_id: created.id, metadata: { title: input.title, targets: rows.length } });
  return { ok: true, id: created.id, targets: rows.length };
}

// ── 조회
export interface CampaignListItem {
  id: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  groupName: string | null;
  templateName: string;
  targets: number;
  responded: number;
}

export async function listCampaigns(programId: string, supportTypeId?: string | null): Promise<CampaignListItem[]> {
  const admin = createAdminClient();
  let q = admin.from('survey_campaigns').select('*').eq('program_id', programId).order('created_at', { ascending: false });
  if (supportTypeId) q = q.eq('support_type_id', supportTypeId);
  const { data: rows } = await q;
  if (!rows?.length) return [];
  const ids = rows.map((r) => r.id);
  const [{ data: targets }, { data: groups }, { data: templates }] = await Promise.all([
    admin.from('survey_campaign_targets').select('campaign_id, responded_at').in('campaign_id', ids),
    admin.from('support_types').select('id, name').eq('program_id', programId),
    admin.from('survey_templates').select('id, name').eq('program_id', programId),
  ]);
  const gName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const tName = new Map((templates ?? []).map((t) => [t.id, t.name]));
  return rows.map((r) => {
    const ts = (targets ?? []).filter((t) => t.campaign_id === r.id);
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      groupName: r.support_type_id ? (gName.get(r.support_type_id) ?? null) : null,
      templateName: tName.get(r.template_id) ?? '',
      targets: ts.length,
      responded: ts.filter((t) => t.responded_at).length,
    };
  });
}

export interface CampaignDetail {
  campaign: Campaign;
  templateName: string;
  groupName: string | null;
  questions: SurveyQuestionRow[];
  targets: CampaignTarget[];
  aggregates: QuestionAggregate[];
  scoreAvg: number | null;
}

export async function getCampaignDetail(id: string): Promise<CampaignDetail | null> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('survey_campaigns').select('*').eq('id', id).maybeSingle();
  if (!c) return null;
  const [{ data: questions }, { data: targets }, { data: tpl }, { data: g }] = await Promise.all([
    admin.from('survey_questions').select('*').eq('template_id', c.template_id).order('sort_order'),
    admin.from('survey_campaign_targets').select('*').eq('campaign_id', id).order('name'),
    admin.from('survey_templates').select('name').eq('id', c.template_id).maybeSingle(),
    c.support_type_id ? admin.from('support_types').select('name').eq('id', c.support_type_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const responded = (targets ?? []).filter((t) => t.responded_at && t.answers);
  const answersList = responded.map((t) => (t.answers && typeof t.answers === 'object' && !Array.isArray(t.answers) ? (t.answers as Record<string, unknown>) : {}));
  const scores = responded.map((t) => (typeof t.score === 'number' ? t.score : null)).filter((x): x is number => x !== null);
  return {
    campaign: c,
    templateName: tpl?.name ?? '',
    groupName: (g as { name: string } | null)?.name ?? null,
    questions: questions ?? [],
    targets: targets ?? [],
    aggregates: aggregateAnswers(questions ?? [], answersList),
    scoreAvg: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
  };
}

// ── 토큰 응답 (플랫폼 내·문자 공용)
export interface TokenSurvey {
  campaign: Pick<Campaign, 'id' | 'title' | 'description' | 'status' | 'starts_at' | 'ends_at'>;
  programName: string;
  targetName: string;
  responded: boolean;
  questions: SurveyQuestionRow[];
}

export async function getTokenSurvey(tokenValue: string): Promise<TokenSurvey | null> {
  const admin = createAdminClient();
  const { data: t } = await admin.from('survey_campaign_targets').select('*').eq('token', tokenValue).maybeSingle();
  if (!t) return null;
  const { data: c } = await admin.from('survey_campaigns').select('*').eq('id', t.campaign_id).maybeSingle();
  if (!c) return null;
  const [{ data: p }, { data: questions }] = await Promise.all([
    admin.from('programs').select('name').eq('id', c.program_id).maybeSingle(),
    admin.from('survey_questions').select('*').eq('template_id', c.template_id).order('sort_order'),
  ]);
  return {
    campaign: { id: c.id, title: c.title, description: c.description, status: c.status, starts_at: c.starts_at, ends_at: c.ends_at },
    programName: p?.name ?? '',
    targetName: t.name,
    responded: !!t.responded_at,
    questions: questions ?? [],
  };
}

export async function submitTokenResponse(tokenValue: string, answers: Record<string, unknown>, channel: 'web' | 'sms'): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: t } = await admin.from('survey_campaign_targets').select('id, campaign_id, responded_at').eq('token', tokenValue).maybeSingle();
  if (!t) return { ok: false, error: '유효하지 않은 조사 링크입니다.' };
  if (t.responded_at) return { ok: false, error: '이미 응답하셨습니다. 참여해 주셔서 감사합니다.' };
  const { data: c } = await admin.from('survey_campaigns').select('template_id, status, starts_at, ends_at, program_id').eq('id', t.campaign_id).maybeSingle();
  if (!c || c.status !== 'open') return { ok: false, error: '종료된 조사입니다.' };
  const now = Date.now();
  if (new Date(c.starts_at).getTime() > now) return { ok: false, error: '아직 시작되지 않은 조사입니다.' };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { ok: false, error: '응답 기간이 지났습니다.' };
  const { data: questions } = await admin.from('survey_questions').select('*').eq('template_id', c.template_id).order('sort_order');
  const v = validateAnswers(questions ?? [], answers);
  if (!v.ok) return v;
  // responded_at IS NULL 조건부 update 로 중복 제출 방지
  const { data: updated, error } = await admin
    .from('survey_campaign_targets')
    .update({ responded_at: new Date().toISOString(), answers: v.clean as Json, score: v.score, channel })
    .eq('id', t.id)
    .is('responded_at', null)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: '이미 응답하셨습니다.' };
  return { ok: true };
}

/** 내(로그인 사용자)가 응답해야 할 열린 조사 — 대시보드 할 일 카드 */
export async function listMyOpenSurveys(userId: string, programId: string): Promise<{ token: string; title: string; endsAt: string | null }[]> {
  const admin = createAdminClient();
  const { data: targets } = await admin.from('survey_campaign_targets').select('token, campaign_id').eq('user_id', userId).is('responded_at', null);
  if (!targets?.length) return [];
  const { data: campaigns } = await admin.from('survey_campaigns').select('id, title, status, starts_at, ends_at, program_id').in('id', targets.map((t) => t.campaign_id)).eq('program_id', programId).eq('status', 'open');
  const now = Date.now();
  const open = (campaigns ?? []).filter((c) => new Date(c.starts_at).getTime() <= now && (!c.ends_at || new Date(c.ends_at).getTime() >= now));
  const byId = new Map(open.map((c) => [c.id, c]));
  return targets
    .filter((t) => byId.has(t.campaign_id))
    .map((t) => ({ token: t.token, title: byId.get(t.campaign_id)!.title, endsAt: byId.get(t.campaign_id)!.ends_at }));
}

// ── 문자 발송 (초대·미참여 독려) — 행사별 문자 API → 플랫폼 폴백. 실패는 건별 기록, 본 작업 비차단.
export async function notifyCampaignTargets(campaignId: string, actorId: string, opts: { onlyUnresponded: boolean; message?: string }): Promise<{ ok: true; sent: number; failed: number; skipped: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('survey_campaigns').select('*').eq('id', campaignId).maybeSingle();
  if (!c) return { ok: false, error: '조사를 찾을 수 없습니다.' };
  const [{ data: p }, { data: targets }] = await Promise.all([
    admin.from('programs').select('name, sms_footer').eq('id', c.program_id).maybeSingle(),
    admin.from('survey_campaign_targets').select('*').eq('campaign_id', campaignId),
  ]);
  const list = (targets ?? []).filter((t) => (opts.onlyUnresponded ? !t.responded_at : true));
  if (list.length === 0) return { ok: false, error: opts.onlyUnresponded ? '미참여자가 없습니다. 전원이 응답했습니다.' : '대상자가 없습니다.' };
  const creds = await resolveSmsCredentials(c.program_id, 'send');
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) return { ok: false, error: '앱 주소(NEXT_PUBLIC_APP_URL)가 설정되지 않아 링크를 만들 수 없습니다.' };

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  for (const t of list) {
    const digits = (t.phone ?? '').replace(/\D/g, '');
    if (digits.length < 10) {
      skipped += 1;
      continue;
    }
    const link = `${base}/s/${t.token}?src=sms`;
    const head = opts.message?.trim() || `[${p?.name ?? ''}] ${t.name}님, '${c.title}'에 참여해 주세요.`;
    const text = `${head}\n${link}${p?.sms_footer ? `\n${p.sms_footer}` : ''}`;
    try {
      const r = await sendSolapiSms(digits, text, creds ? { creds } : {});
      if (r.ok) {
        sent += 1;
        await admin.from('survey_campaign_targets').update({ notify_count: t.notify_count + 1, last_notified_at: now }).eq('id', t.id);
      } else failed += 1;
    } catch {
      failed += 1;
    }
  }
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: 'survey.campaign_notified', entity_type: 'survey_campaigns', entity_id: campaignId, metadata: { only_unresponded: opts.onlyUnresponded, sent, failed, skipped } });
  return { ok: true, sent, failed, skipped };
}

export async function setCampaignStatus(campaignId: string, status: 'open' | 'closed', actorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('survey_campaigns').select('program_id').eq('id', campaignId).maybeSingle();
  if (!c) return { ok: false, error: '조사를 찾을 수 없습니다.' };
  const { error } = await admin.from('survey_campaigns').update({ status }).eq('id', campaignId);
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: status === 'closed' ? 'survey.campaign_closed' : 'survey.campaign_reopened', entity_type: 'survey_campaigns', entity_id: campaignId, metadata: {} });
  return { ok: true };
}
