import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendSolapiSms } from '@/lib/notifications/solapi';
import { resolveSmsCredentials } from '@/lib/sms/secrets';
import { aggregateAnswers, type QuestionAggregate, type SurveyQuestionRow } from '@/lib/surveys/validate';

/**
 * 종결 만족도(케이스별 자동 조사)의 실시간 분석 + 미응답 멘티 독려 (2026-09-08 요건).
 * 대상 = 종결 요청 이상 상태의 케이스 멘티. 응답은 survey_responses(케이스당 1건).
 */
const OPEN = ['closure_requested', 'revision_requested', 'settlement_pending', 'settlement_batched', 'closed'] as const;

export interface SatisfactionOverview {
  eligible: number;
  responded: number;
  scoreAvg: number | null;
  aggregates: QuestionAggregate[];
  /** 문항 집계에 쓴 템플릿 이름 (응답이 여러 템플릿이면 최다 응답 템플릿) */
  templateName: string | null;
  unresponded: { caseId: string; menteeId: string | null; name: string; businessName: string; phone: string | null; status: string }[];
}

export async function satisfactionOverview(programId: string, supportTypeId?: string | null): Promise<SatisfactionOverview> {
  const admin = createAdminClient();
  let q = admin.from('cases').select('id, mentee_id, owner_name, business_name, phone, status').eq('program_id', programId).in('status', [...OPEN]);
  if (supportTypeId) q = q.eq('support_type_id', supportTypeId);
  const { data: cases } = await q;
  const list = cases ?? [];
  const caseIds = list.map((c) => c.id);
  const { data: responses } = caseIds.length ? await admin.from('survey_responses').select('*').in('case_id', caseIds) : { data: [] as { case_id: string; template_id: string; answers: unknown; score: number | null }[] };
  const respByCase = new Map((responses ?? []).map((r) => [r.case_id, r]));

  // 최다 응답 템플릿 기준 문항 집계
  const counts = new Map<string, number>();
  for (const r of responses ?? []) counts.set(r.template_id, (counts.get(r.template_id) ?? 0) + 1);
  const topTemplate = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  let aggregates: QuestionAggregate[] = [];
  let templateName: string | null = null;
  if (topTemplate) {
    const [{ data: questions }, { data: tpl }] = await Promise.all([
      admin.from('survey_questions').select('*').eq('template_id', topTemplate).order('sort_order'),
      admin.from('survey_templates').select('name, version').eq('id', topTemplate).maybeSingle(),
    ]);
    const answersList = (responses ?? [])
      .filter((r) => r.template_id === topTemplate)
      .map((r) => (r.answers && typeof r.answers === 'object' && !Array.isArray(r.answers) ? (r.answers as Record<string, unknown>) : {}));
    aggregates = aggregateAnswers((questions ?? []) as SurveyQuestionRow[], answersList);
    templateName = tpl ? `${tpl.name} v${tpl.version}` : null;
  }
  const scores = (responses ?? []).map((r) => r.score).filter((x): x is number => typeof x === 'number');
  return {
    eligible: list.length,
    responded: (responses ?? []).length,
    scoreAvg: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
    aggregates,
    templateName,
    unresponded: list
      .filter((c) => !respByCase.has(c.id))
      .map((c) => ({ caseId: c.id, menteeId: c.mentee_id, name: c.owner_name, businessName: c.business_name, phone: c.phone, status: c.status })),
  };
}

/** 미응답 멘티 일괄 독려 문자 — 플랫폼 로그인 후 /mentee/survey 에서 응답 */
export async function remindSatisfaction(programId: string, supportTypeId: string | null, actorId: string, message?: string): Promise<{ ok: true; sent: number; failed: number; skipped: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const o = await satisfactionOverview(programId, supportTypeId);
  if (o.unresponded.length === 0) return { ok: false, error: '미응답 멘티가 없습니다. 전원이 응답했습니다.' };
  const { data: p } = await admin.from('programs').select('name, sms_footer').eq('id', programId).maybeSingle();
  const creds = await resolveSmsCredentials(programId, 'send');
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const t of o.unresponded) {
    const digits = (t.phone ?? '').replace(/\D/g, '');
    if (digits.length < 10) {
      skipped += 1;
      continue;
    }
    const head = message?.trim() || `[${p?.name ?? ''}] ${t.name}님, 멘토링 만족도 조사에 참여해 주세요.`;
    const text = `${head}\n${base}/mentee/survey (로그인 후 응답)${p?.sms_footer ? `\n${p.sms_footer}` : ''}`;
    try {
      const r = await sendSolapiSms(digits, text, creds ? { creds } : {});
      if (r.ok) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: programId, action: 'survey.satisfaction_reminded', entity_type: 'programs', entity_id: programId, metadata: { sent, failed, skipped } });
  return { ok: true, sent, failed, skipped };
}

const REMIND_AFTER_MS = 7 * 24 * 3600 * 1000;

/**
 * 만족도 자동 리마인드 (P20, Cron 일 1회) — 개시(survey_opened_at) 1주일 경과·미응답·미리마인드 케이스에
 * 독려 문자 1회 발송 후 survey_reminded_at 기록. 문자 실패는 본 작업을 막지 않는다(케이스별 격리).
 */
export async function sendAutoSurveyReminders(): Promise<{ scanned: number; sent: number; failed: number; skipped: number }> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - REMIND_AFTER_MS).toISOString();
  const { data: cases } = await admin
    .from('cases')
    .select('id, program_id, owner_name, phone, status, survey_opened_at')
    .not('survey_opened_at', 'is', null)
    .lte('survey_opened_at', cutoff)
    .is('survey_reminded_at', null)
    .neq('status', 'withdrawn')
    .limit(200);
  const list = cases ?? [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  if (list.length === 0) return { scanned: 0, sent, failed, skipped };

  const caseIds = list.map((c) => c.id);
  const { data: responses } = await admin.from('survey_responses').select('case_id').in('case_id', caseIds);
  const responded = new Set((responses ?? []).map((r) => r.case_id));
  const programIds = Array.from(new Set(list.map((c) => c.program_id)));
  const { data: programs } = await admin.from('programs').select('id, name, sms_footer').in('id', programIds);
  const programById = new Map((programs ?? []).map((p) => [p.id, p]));
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

  for (const c of list) {
    if (responded.has(c.id)) {
      // 이미 응답 — 리마인드 불필요로 마감
      await admin.from('cases').update({ survey_reminded_at: new Date().toISOString() }).eq('id', c.id).is('survey_reminded_at', null);
      continue;
    }
    const digits = (c.phone ?? '').replace(/\D/g, '');
    if (digits.length < 10) {
      skipped += 1;
      await admin.from('cases').update({ survey_reminded_at: new Date().toISOString() }).eq('id', c.id).is('survey_reminded_at', null);
      continue;
    }
    const p = programById.get(c.program_id);
    const text = `[${p?.name ?? ''}] ${c.owner_name}님, 멘토링 만족도 조사가 아직 완료되지 않았습니다. 참여 부탁드립니다.\n${base}/mentee/survey (로그인 후 응답)${p?.sms_footer ? `\n${p.sms_footer}` : ''}`;
    try {
      const creds = await resolveSmsCredentials(c.program_id, 'send');
      const r = await sendSolapiSms(digits, text, creds ? { creds } : {});
      if (r.ok) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
    // 성공·실패와 무관하게 1회만 시도 (반복 발송 방지)
    await admin.from('cases').update({ survey_reminded_at: new Date().toISOString() }).eq('id', c.id).is('survey_reminded_at', null);
    await admin.from('audit_logs').insert({
      actor_id: null,
      program_id: c.program_id,
      action: 'survey.auto_reminded',
      entity_type: 'cases',
      entity_id: c.id,
      metadata: { via: 'cron' },
    });
  }
  return { scanned: list.length, sent, failed, skipped };
}
