'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless, CAPABILITIES, STAFF_GRADES } from '@/lib/auth/capabilities';

import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { policyFromParams } from '@/lib/settlement/compute';
import { ROUND_REPORT_TEMPLATE_KEY, templateHasSign } from '@/lib/documents/round-report';
import type { Json } from '@/types/database';

/**
 * 설정 액션 결과. `needConfirm` 이면 저장하지 않고 화면이 window.confirm 으로 영향 범위를 보여준 뒤
 * `confirm_end` / `confirm_rounds` 를 'true' 로 다시 보낸다 (P30 그룹 종료·회차 수 변경 가드).
 */
type Result =
  | { ok: true; id?: string; message?: string }
  | { ok: false; error: string; needConfirm?: boolean; openCases?: number; affected?: { overRounds: number; inReview: number } };
const OPERATOR_ONLY = '운영사 담당자만 실행할 수 있습니다.';
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/** 운영사 + 행사 컨텍스트. 설정 변경은 실제 신원(대행 불가). */
async function operator(cap: 'settings' | 'settings.money' = 'settings'): Promise<{ id: string; programId: string } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, cap);
  if (denied) return { error: denied };
  return { id: profile.id, programId: ctx.programId };
}

async function audit(actorId: string, programId: string, key: string, before: unknown, after: unknown, entityId?: string, action = 'settings.update') {
  const { error } = await createAdminClient().from('audit_logs').insert({
    actor_id: actorId,
    program_id: programId,
    action,
    entity_type: 'settings',
    entity_id: entityId ?? null,
    metadata: { key, before, after } as Json,
  });
  // 감사 insert 오류는 삼키지 않는다 (CLAUDE.md §6-3)
  if (error) console.error(`settings audit insert failed (${action}/${key}):`, error.message);
}

function revalidateAll() {
  revalidatePath('/nextlab/settings');
  revalidatePath('/nextlab/dashboard');
  revalidatePath('/hub');
}

async function groupInProgram(groupId: string, programId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('support_types').select('program_id').eq('id', groupId).maybeSingle();
  return !!data && data.program_id === programId;
}

// ---------------------------------------------------------------- 행사 기본(브랜딩)
const programSchema = z.object({
  name: z.string().trim().min(1, '행사명을 입력하세요.'),
  client_name: z.string().trim().min(1, '발주처 기관명을 입력하세요.'),
  client_short: z.string().trim().optional().transform((v) => v || null),
  client_seal_name: z.string().trim().optional().transform((v) => v || null),
  operator_name: z.string().trim().min(1, '용역사(운영) 기관명을 입력하세요.'),
  operator_short: z.string().trim().optional().transform((v) => v || null),
  operator_contact: z.string().trim().optional().transform((v) => v || null),
  app_title: z.string().trim().optional().transform((v) => v || null),
  sms_footer: z.string().trim().optional().transform((v) => v || null),
  email_subject_prefix: z.string().trim().optional().transform((v) => v || null),
  starts_on: z.string().trim().optional().transform((v) => v || null),
  ends_on: z.string().trim().optional().transform((v) => v || null),
  default_required_rounds: z.coerce.number().int().min(1).max(20),
});

export async function updateProgramAction(input: unknown): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = programSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const admin = createAdminClient();
  const { data: before } = await admin.from('programs').select('*').eq('id', op.programId).maybeSingle();
  const { error } = await admin.from('programs').update(parsed.data).eq('id', op.programId);
  if (error) return { ok: false, error: error.message };
  await audit(op.id, op.programId, 'program', before, parsed.data, op.programId);
  revalidateAll();
  revalidatePath('/', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------- 사업그룹
const groupSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1, '그룹 코드를 입력하세요.').max(20).regex(/^[A-Za-z0-9_-]+$/, '코드는 영문·숫자·-·_ 만 허용'),
  name: z.string().trim().min(1, '그룹명을 입력하세요.'),
  description: z.string().trim().optional().transform((v) => v || null),
  required_rounds: z.coerce.number().int().min(1).max(20),
  round_label: z.string().trim().min(1).default('컨설팅'),
  starts_on: z.string().trim().optional().transform((v) => v || null),
  ends_on: z.string().trim().optional().transform((v) => v || null),
  predecessor_support_type_id: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
  status: z.enum(['active', 'ended']).default('active'),
  sort_order: z.coerce.number().int().default(0),
  withholding_method: z.enum(['other_income', 'business_income', 'none', '']).optional().transform((v) => v || null),
  report_policy_mode: z.enum(['inherit', 'custom']).default('inherit'),
  mentee_confirm_signature: z.coerce.boolean().optional(),
  mentor_auto_sign: z.coerce.boolean().optional(),
  /** 새 그룹: 설정을 복사해 올 그룹 (P30) */
  copy_from: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
  /** 가드 확인 플래그 — 화면이 영향 범위를 confirm 한 뒤 'true' 로 재제출 */
  confirm_end: z.string().optional(),
  confirm_rounds: z.string().optional(),
}).refine((v) => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on, { message: '종료일은 시작일보다 빠를 수 없습니다.', path: ['ends_on'] });

const OPEN_CASE_STATUSES_EXCL = ['closed', 'withdrawn'] as const;

/** 승계 원천 체인에 자기 자신이 나오면 순환 (A→C→A) */
async function predecessorCycle(startId: string, selfId: string | undefined, programId: string): Promise<boolean> {
  const admin = createAdminClient();
  const seen = new Set<string>();
  let cursor: string | null = startId;
  for (let i = 0; i < 20 && cursor; i += 1) {
    if (selfId && cursor === selfId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const res: { data: { predecessor_support_type_id: string | null } | null } = await admin.from('support_types').select('predecessor_support_type_id').eq('id', cursor).eq('program_id', programId).maybeSingle();
    cursor = res.data?.predecessor_support_type_id ?? null;
  }
  return false;
}

/** 그룹의 보고서 등록 회차 수(케이스별) — 회차 수 변경 영향 계산용 */
async function reportedCountsByCase(caseIds: string[]): Promise<Map<string, number>> {
  const admin = createAdminClient();
  const rows = await fetchAllIn<{ case_id: string }>(caseIds, (chunk, from, to) => admin.from('mentoring_logs').select('case_id').in('case_id', chunk).not('report_registered_at', 'is', null).range(from, to));
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.case_id, (m.get(r.case_id) ?? 0) + 1);
  return m;
}

/**
 * 새 그룹에 다른 그룹의 설정을 복사한다 (P30) — 필수서류·정원·서명 정책·원천징수·단가·한도·보고서 양식·만족도 양식·리마인더·위촉 서식.
 * 표마다 try/catch — 한 표의 실패가 그룹 생성을 되돌리지 않는다. 결과 카운트를 감사에 남긴다.
 */
async function copyGroupSettings(fromId: string, toId: string, programId: string, actorId: string, keep: { withholding: boolean; reportPolicy: boolean }): Promise<Record<string, number | string>> {
  const admin = createAdminClient();
  const today = kstToday();
  const out: Record<string, number | string> = {};
  const step = async (key: string, fn: () => Promise<number>) => {
    try {
      out[key] = await fn();
    } catch (err) {
      out[key] = `error: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`copyGroupSettings ${key} failed:`, err);
    }
  };
  await step('group_fields', async () => {
    const { data: src } = await admin.from('support_types').select('max_mentees_per_mentor, round_report_policy, withholding_method').eq('id', fromId).maybeSingle();
    if (!src) return 0;
    const patch: { max_mentees_per_mentor: number; round_report_policy?: Json; withholding_method?: string | null } = { max_mentees_per_mentor: src.max_mentees_per_mentor };
    if (!keep.reportPolicy) patch.round_report_policy = src.round_report_policy as Json;
    if (!keep.withholding) patch.withholding_method = src.withholding_method;
    const { error } = await admin.from('support_types').update(patch).eq('id', toId);
    if (error) throw new Error(error.message);
    return 1;
  });
  await step('documents', async () => {
    const { data: docs } = await admin.from('support_type_documents').select('*').eq('support_type_id', fromId);
    const rows = (docs ?? []).map((x) => ({ support_type_id: toId, doc_key: x.doc_key, doc_name: x.doc_name, is_required: x.is_required, multiple: x.multiple, for_role: x.for_role, condition: x.condition, attachment_no: x.attachment_no, sort_order: x.sort_order }));
    if (rows.length) {
      const { error } = await admin.from('support_type_documents').insert(rows);
      if (error) throw new Error(error.message);
    }
    return rows.length;
  });
  const latest = <T extends { effective_from: string }>(rows: T[], key: (r: T) => string) => {
    const m = new Map<string, T>();
    for (const r of rows) {
      if (r.effective_from > today) continue;
      const cur = m.get(key(r));
      if (!cur || cur.effective_from < r.effective_from) m.set(key(r), r);
    }
    return Array.from(m.values());
  };
  await step('rates', async () => {
    const { data: rates } = await admin.from('consulting_rates').select('*').eq('program_id', programId).eq('support_type_id', fromId);
    const rows = latest(rates ?? [], (r) => r.mode).map((r) => ({ program_id: programId, support_type_id: toId, mode: r.mode, unit_price: r.unit_price, daily_cap_amount: r.daily_cap_amount, effective_from: today, created_by: actorId }));
    if (rows.length) {
      const { error } = await admin.from('consulting_rates').insert(rows);
      if (error) throw new Error(error.message);
    }
    return rows.length;
  });
  await step('limits', async () => {
    const { data: limits } = await admin.from('operating_limits').select('*').eq('program_id', programId).eq('support_type_id', fromId);
    const rows = latest(limits ?? [], () => 'x').map((r) => ({ program_id: programId, support_type_id: toId, mentor_daily_case_limit: r.mentor_daily_case_limit, case_daily_round_limit: r.case_daily_round_limit, effective_from: today, created_by: actorId }));
    if (rows.length) {
      const { error } = await admin.from('operating_limits').insert(rows);
      if (error) throw new Error(error.message);
    }
    return rows.length;
  });
  await step('report_templates', async () => {
    const { data: tpls } = await admin.from('document_templates').select('*').eq('program_id', programId).eq('support_type_id', fromId);
    let n = 0;
    for (const t of tpls ?? []) {
      const { error } = await admin.from('document_templates').insert({ program_id: programId, support_type_id: toId, template_key: t.template_key, name: t.name, html_content: t.html_content, field_mapping: t.field_mapping, attachment_no: t.attachment_no, is_active: t.is_active, updated_by: actorId });
      if (error) throw new Error(error.message);
      n += 1;
    }
    return n;
  });
  await step('survey_templates', async () => {
    const { data: tpls } = await admin.from('survey_templates').select('*').eq('program_id', programId).eq('support_type_id', fromId).eq('is_active', true);
    let n = 0;
    for (const s of tpls ?? []) {
      const { data: nt, error } = await admin.from('survey_templates').insert({ program_id: programId, support_type_id: toId, name: s.name, version: 1, is_active: true, created_by: actorId }).select('id').single();
      if (error || !nt) throw new Error(error?.message ?? 'survey template insert failed');
      const { data: qs } = await admin.from('survey_questions').select('*').eq('template_id', s.id).order('sort_order');
      if ((qs ?? []).length) {
        const { error: qErr } = await admin.from('survey_questions').insert((qs ?? []).map((q) => ({ template_id: nt.id, sort_order: q.sort_order, qtype: q.qtype, label: q.label, help: q.help, options: q.options, required: q.required })));
        if (qErr) throw new Error(qErr.message);
      }
      n += 1;
    }
    return n;
  });
  await step('mentor_reminder_settings', async () => {
    const { data: rows } = await admin.from('mentor_reminder_settings').select('*').eq('program_id', programId).eq('support_type_id', fromId);
    let n = 0;
    for (const r of rows ?? []) {
      const { error } = await admin.from('mentor_reminder_settings').insert({ program_id: programId, support_type_id: toId, enabled: r.enabled, weekday: r.weekday, send_hour: r.send_hour, send_minute: r.send_minute, template: r.template, updated_by: actorId });
      if (error) throw new Error(error.message);
      n += 1;
    }
    return n;
  });
  await step('mentor_form_settings', async () => {
    const { data: rows } = await admin.from('mentor_form_settings').select('*').eq('program_id', programId).eq('support_type_id', fromId);
    let n = 0;
    for (const r of rows ?? []) {
      const { error } = await admin.from('mentor_form_settings').insert({ program_id: programId, support_type_id: toId, form_key: r.form_key, enabled: r.enabled, method: r.method, title: r.title, content: r.content, template_path: r.template_path, template_name: r.template_name, updated_by: actorId });
      if (error) throw new Error(error.message);
      n += 1;
    }
    return n;
  });
  return out;
}

export async function upsertGroupAction(input: unknown): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const d = parsed.data;
  const admin = createAdminClient();
  if (d.predecessor_support_type_id) {
    if (!(await groupInProgram(d.predecessor_support_type_id, op.programId))) return { ok: false, error: '승계 원천 그룹이 이 행사의 그룹이 아닙니다.' };
    if (d.id && d.predecessor_support_type_id === d.id) return { ok: false, error: '자기 자신을 승계 원천으로 지정할 수 없습니다.' };
    if (await predecessorCycle(d.predecessor_support_type_id, d.id, op.programId)) return { ok: false, error: '승계 원천이 순환합니다(A→C→A). 원천 그룹을 다시 확인하세요.' };
  }
  if (d.copy_from && !(await groupInProgram(d.copy_from, op.programId))) return { ok: false, error: '설정을 복사할 그룹이 이 행사의 그룹이 아닙니다.' };
  const round_report_policy = d.report_policy_mode === 'custom' ? { mentee_confirm_signature: !!d.mentee_confirm_signature, mentor_auto_sign: !!d.mentor_auto_sign } : null;
  const row = {
    program_id: op.programId,
    code: d.code,
    name: d.name,
    description: d.description,
    required_rounds: d.required_rounds,
    round_label: d.round_label,
    starts_on: d.starts_on,
    ends_on: d.ends_on,
    predecessor_support_type_id: d.predecessor_support_type_id,
    status: d.status,
    sort_order: d.sort_order,
    withholding_method: d.withholding_method,
    round_report_policy: round_report_policy as Json,
  };
  if (d.id) {
    if (!(await groupInProgram(d.id, op.programId))) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
    const { data: before } = await admin.from('support_types').select('*').eq('id', d.id).maybeSingle();
    if (!before) return { ok: false, error: '그룹을 찾을 수 없습니다.' };

    // 그룹 케이스(종결·중도 종료 제외) — 종료 가드·회차 수 변경 영향 계산 공용
    const { data: openCasesRaw } = await admin.from('cases').select('id, status, survey_opened_at').eq('support_type_id', d.id).not('status', 'in', `(${OPEN_CASE_STATUSES_EXCL.join(',')})`);
    const openCases = openCasesRaw ?? [];

    // 1) 그룹 종료 가드 (P30): 진행 중 케이스가 남아 있으면 확인 후에만 종료
    if (before.status === 'active' && d.status === 'ended' && openCases.length > 0 && d.confirm_end !== 'true') {
      return { ok: false, needConfirm: true, openCases: openCases.length, error: `진행 중(종결·중도 종료 제외) 케이스 ${openCases.length}건이 남아 있습니다. 그룹을 종료하면 새 회차 등록·멘티 등록이 막힙니다. 계속할까요?` };
    }

    // 2) 회차 수 변경 영향 (P30)
    let roundsImpact: { overRounds: number; inReview: number; reopenedSurveys: number; extraRecomputed: number } | null = null;
    if (before.required_rounds !== d.required_rounds && openCases.length > 0) {
      const reported = await reportedCountsByCase(openCases.map((c) => c.id));
      const overRounds = openCases.filter((c) => (reported.get(c.id) ?? 0) > d.required_rounds).length;
      const inReview = openCases.filter((c) => c.status === 'closure_requested' || c.status === 'revision_requested').length;
      if ((overRounds > 0 || inReview > 0) && d.confirm_rounds !== 'true') {
        return {
          ok: false,
          needConfirm: true,
          affected: { overRounds, inReview },
          error: `회차 수를 ${before.required_rounds}→${d.required_rounds}회로 바꾸면 새 회차 수를 넘겨 이행한 케이스 ${overRounds}건, 검수 중(종결 요청·보완) 케이스 ${inReview}건에 영향이 있습니다. 추가 회차 표시(is_extra)를 다시 계산하고 목표 회차를 채운 케이스의 만족도 조사를 엽니다. 계속할까요?`,
        };
      }
      roundsImpact = { overRounds, inReview, reopenedSurveys: 0, extraRecomputed: 0 };
    }

    const { error } = await admin.from('support_types').update(row).eq('id', d.id);
    if (error) return { ok: false, error: error.code === '23505' ? '같은 코드의 그룹이 있습니다.' : error.message };

    if (roundsImpact) {
      // 미정산 회차의 is_extra 재계산 (정산 스냅샷에 든 회차는 불변)
      const caseIds = openCases.map((c) => c.id);
      const logs = await fetchAllIn<{ id: string; round_no: number; is_extra: boolean }>(caseIds, (chunk, from, to) => admin.from('mentoring_logs').select('id, round_no, is_extra').in('case_id', chunk).is('settlement_id', null).range(from, to));
      const toExtra = logs.filter((l) => l.round_no > d.required_rounds && !l.is_extra).map((l) => l.id);
      const toNormal = logs.filter((l) => l.round_no <= d.required_rounds && l.is_extra).map((l) => l.id);
      for (let i = 0; i < toExtra.length; i += 200) await admin.from('mentoring_logs').update({ is_extra: true }).in('id', toExtra.slice(i, i + 200));
      for (let i = 0; i < toNormal.length; i += 200) await admin.from('mentoring_logs').update({ is_extra: false }).in('id', toNormal.slice(i, i + 200));
      roundsImpact.extraRecomputed = toExtra.length + toNormal.length;
      // 목표 회차를 이미 채운 케이스 → 만족도 조사 개시 (registerRoundReport 의 자동 개시와 같은 조건)
      const reported = await reportedCountsByCase(caseIds);
      const openSurvey = openCases.filter((c) => !c.survey_opened_at && (reported.get(c.id) ?? 0) >= d.required_rounds).map((c) => c.id);
      if (openSurvey.length) await admin.from('cases').update({ survey_opened_at: new Date().toISOString() }).in('id', openSurvey).is('survey_opened_at', null);
      roundsImpact.reopenedSurveys = openSurvey.length;
      await audit(op.id, op.programId, 'support_type.required_rounds', { required_rounds: before.required_rounds }, { required_rounds: d.required_rounds, ...roundsImpact }, d.id, 'support_type.required_rounds_changed');
    }
    if (before.status === 'active' && d.status === 'ended') {
      await audit(op.id, op.programId, 'support_type.status', { status: before.status }, { status: 'ended', open_cases: openCases.length }, d.id, 'support_type.ended');
    }
    await audit(op.id, op.programId, 'support_type', before, row, d.id);
    revalidateAll();
    return {
      ok: true,
      id: d.id,
      message: roundsImpact ? `회차 수를 변경했습니다. 추가 회차 표시 재계산 ${roundsImpact.extraRecomputed}건 · 만족도 조사 개시 ${roundsImpact.reopenedSurveys}건` : undefined,
    };
  }
  const { data: ins, error } = await admin.from('support_types').insert(row).select('id').single();
  if (error || !ins) return { ok: false, error: error?.code === '23505' ? '같은 코드의 그룹이 있습니다.' : (error?.message ?? '저장 실패') };
  await audit(op.id, op.programId, 'support_type', null, row, ins.id);
  let message: string | undefined;
  if (d.copy_from) {
    const copied = await copyGroupSettings(d.copy_from, ins.id, op.programId, op.id, { withholding: !!d.withholding_method, reportPolicy: d.report_policy_mode === 'custom' });
    await audit(op.id, op.programId, 'support_type.copy_settings', { from: d.copy_from }, copied, ins.id, 'support_type.copy_settings');
    const failed = Object.entries(copied).filter(([, v]) => typeof v === 'string');
    message = failed.length ? `그룹을 추가했지만 일부 설정 복사에 실패했습니다: ${failed.map(([k]) => k).join(', ')}` : `그룹을 추가하고 설정을 복사했습니다 (필수서류 ${copied.documents ?? 0} · 단가 ${copied.rates ?? 0} · 한도 ${copied.limits ?? 0} · 양식 ${copied.report_templates ?? 0}/${copied.survey_templates ?? 0}).`;
  }
  revalidateAll();
  return { ok: true, id: ins.id, message };
}

/** 그룹 삭제 (P30) — 케이스 0건 · PL(또는 등급 없음) · settings 권한. 그룹 범위 설정 행을 함께 지운다. */
export async function deleteGroupAction(groupId: string): Promise<Result> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  { const denied = denyUnless(ctx, 'settings'); if (denied) return { ok: false, error: denied }; }
  if (ctx.grade && ctx.grade !== 'pl') return { ok: false, error: '그룹 삭제는 메인 담당자(PL)만 할 수 있습니다.' };
  const admin = createAdminClient();
  const { data: g } = await admin.from('support_types').select('*').eq('id', groupId).eq('program_id', ctx.programId).maybeSingle();
  if (!g) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
  const { count } = await admin.from('cases').select('id', { count: 'exact', head: true }).eq('support_type_id', groupId);
  if ((count ?? 0) > 0) return { ok: false, error: `케이스가 ${count}건 있는 그룹은 삭제할 수 없습니다. 대신 상태를 '종료'로 바꾸세요.` };
  // 이 그룹을 승계 원천으로 가리키는 그룹은 링크 해제
  await admin.from('support_types').update({ predecessor_support_type_id: null }).eq('predecessor_support_type_id', groupId);
  const children: { table: 'support_type_documents' | 'support_type_members' | 'consulting_rates' | 'operating_limits' | 'document_templates' | 'survey_templates' | 'mentor_reminder_settings' | 'mentor_form_settings' | 'report_snapshots'; col: string }[] = [
    { table: 'support_type_documents', col: 'support_type_id' },
    { table: 'support_type_members', col: 'support_type_id' },
    { table: 'consulting_rates', col: 'support_type_id' },
    { table: 'operating_limits', col: 'support_type_id' },
    { table: 'document_templates', col: 'support_type_id' },
    { table: 'survey_templates', col: 'support_type_id' },
    { table: 'mentor_reminder_settings', col: 'support_type_id' },
    { table: 'mentor_form_settings', col: 'support_type_id' },
    { table: 'report_snapshots', col: 'support_type_id' },
  ];
  const removed: Record<string, number> = {};
  for (const c of children) {
    const { data, error } = await admin.from(c.table).delete().eq(c.col, groupId).select('id');
    if (error) return { ok: false, error: `${c.table} 정리 실패: ${error.message}` };
    removed[c.table] = (data ?? []).length;
  }
  const { error } = await admin.from('support_types').delete().eq('id', groupId);
  if (error) return { ok: false, error: `삭제 실패: ${error.message}` };
  await audit(profile.id, ctx.programId, 'support_type', g, { deleted: true, removed }, groupId, 'support_type.deleted');
  revalidateAll();
  return { ok: true };
}

const groupDocSchema = z.object({
  id: z.string().uuid().optional(),
  support_type_id: z.string().uuid(),
  doc_key: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/, '키는 영문·숫자·-·_ 만 허용'),
  doc_name: z.string().trim().min(1, '서류 이름을 입력하세요.'),
  is_required: z.coerce.boolean().default(true),
  multiple: z.coerce.boolean().default(false),
  for_role: z.enum(['mentee', 'mentor', 'staff']).default('mentee'),
  condition: z.string().trim().optional().transform((v) => v || null),
  sort_order: z.coerce.number().int().default(0),
});

export async function upsertGroupDocAction(input: unknown): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = groupDocSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const d = parsed.data;
  if (!(await groupInProgram(d.support_type_id, op.programId))) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
  const admin = createAdminClient();
  const { id, ...row } = d;
  const q = id ? admin.from('support_type_documents').update(row).eq('id', id).select('id').single() : admin.from('support_type_documents').insert(row).select('id').single();
  const { data, error } = await q;
  if (error || !data) return { ok: false, error: error?.code === '23505' ? '같은 키의 서류가 이미 있습니다.' : (error?.message ?? '저장 실패') };
  await audit(op.id, op.programId, 'support_type_document', id ? { id } : null, row, data.id);
  revalidateAll();
  return { ok: true, id: data.id };
}

export async function deleteGroupDocAction(docId: string): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: doc } = await admin.from('support_type_documents').select('*').eq('id', docId).maybeSingle();
  if (!doc || !(await groupInProgram(doc.support_type_id, op.programId))) return { ok: false, error: '이 행사의 서류 설정이 아닙니다.' };
  await admin.from('support_type_documents').delete().eq('id', docId);
  await audit(op.id, op.programId, 'support_type_document', doc, null, docId);
  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------- 단가 · 한도 (이력 행 추가)
const rateSchema = z.object({
  support_type_id: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
  mode: z.enum(['online', 'offline']),
  unit_price: z.coerce.number().min(0),
  daily_cap_amount: z.coerce.number().min(0),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '적용일을 입력하세요.'),
});

export async function addRateAction(input: unknown): Promise<Result> {
  const op = await operator('settings.money');
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const d = parsed.data;
  if (d.support_type_id && !(await groupInProgram(d.support_type_id, op.programId))) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
  if (d.daily_cap_amount < d.unit_price) return { ok: false, error: '일일 상한은 단가 이상이어야 합니다.' };
  const admin = createAdminClient();
  const row = { program_id: op.programId, ...d, created_by: op.id };
  const { data, error } = await admin.from('consulting_rates').insert(row).select('id').single();
  if (error || !data) return { ok: false, error: error?.code === '23505' ? '같은 범위·유형·적용일의 단가가 이미 있습니다.' : (error?.message ?? '저장 실패') };
  await audit(op.id, op.programId, 'consulting_rate', null, row, data.id);
  revalidateAll();
  return { ok: true, id: data.id };
}

const limitSchema = z.object({
  support_type_id: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
  mentor_daily_case_limit: z.coerce.number().int().min(1).max(50),
  case_daily_round_limit: z.coerce.number().int().min(1).max(20),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '적용일을 입력하세요.'),
});

export async function addLimitAction(input: unknown): Promise<Result> {
  const op = await operator('settings.money');
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = limitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const d = parsed.data;
  if (d.support_type_id && !(await groupInProgram(d.support_type_id, op.programId))) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
  const admin = createAdminClient();
  const row = { program_id: op.programId, ...d, created_by: op.id };
  const { data, error } = await admin.from('operating_limits').insert(row).select('id').single();
  if (error || !data) return { ok: false, error: error?.code === '23505' ? '같은 범위·적용일의 한도가 이미 있습니다.' : (error?.message ?? '저장 실패') };
  await audit(op.id, op.programId, 'operating_limit', null, row, data.id);
  revalidateAll();
  return { ok: true, id: data.id };
}

/** 미래 적용일 행만 삭제 가능 (과거 정산 불변) */
export async function deleteFutureRowAction(table: 'consulting_rates' | 'operating_limits', id: string): Promise<Result> {
  const op = await operator('settings.money');
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: row } = await admin.from(table).select('*').eq('id', id).maybeSingle();
  if (!row || row.program_id !== op.programId) return { ok: false, error: '이 행사의 설정이 아닙니다.' };
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (row.effective_from <= today) return { ok: false, error: '이미 적용 중이거나 지난 이력은 삭제할 수 없습니다. 새 적용일로 행을 추가하세요.' };
  await admin.from(table).delete().eq('id', id);
  await audit(op.id, op.programId, table, row, null, id);
  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------- 정산(원천징수) · 종결 게이트 · 보고서 서명 정책
const withholdingSchema = z.object({
  default_withholding_method: z.enum(['other_income', 'business_income', 'none']),
  other_income: z.object({ expense_rate: z.coerce.number().min(0).max(1), tax_rate: z.coerce.number().min(0).max(1), local_rate: z.coerce.number().min(0).max(1), min_taxable_exempt: z.coerce.number().min(0), rounding: z.enum(['floor_10', 'floor_1', 'round']).default('floor_10') }),
  business_income: z.object({ tax_rate: z.coerce.number().min(0).max(1), local_rate: z.coerce.number().min(0).max(1), rounding: z.enum(['floor_10', 'floor_1', 'round']).default('floor_10') }),
});

export async function updateWithholdingAction(input: unknown): Promise<Result> {
  const op = await operator('settings.money');
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = withholdingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const params = { other_income: parsed.data.other_income, business_income: parsed.data.business_income };
  try {
    policyFromParams('other_income', params);
    policyFromParams('business_income', params);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '파라미터 오류' };
  }
  const admin = createAdminClient();
  const { data: before } = await admin.from('programs').select('default_withholding_method, withholding_params').eq('id', op.programId).maybeSingle();
  const after = { default_withholding_method: parsed.data.default_withholding_method, withholding_params: params as Json };
  const { error } = await admin.from('programs').update(after).eq('id', op.programId);
  if (error) return { ok: false, error: error.message };
  await audit(op.id, op.programId, 'withholding', before, after, op.programId);
  revalidateAll();
  return { ok: true };
}

const closureSchema = z.object({
  require_mentee_signature: z.coerce.boolean().default(false),
  require_group_docs: z.coerce.boolean().default(false),
  block_batch_on_missing_mentor_docs: z.coerce.boolean().default(false),
});

export async function updateClosurePolicyAction(input: unknown): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = closureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: '입력값을 확인하세요.' };
  const admin = createAdminClient();
  const { data: before } = await admin.from('programs').select('closure_policy').eq('id', op.programId).maybeSingle();
  const { error } = await admin.from('programs').update({ closure_policy: parsed.data as Json }).eq('id', op.programId);
  if (error) return { ok: false, error: error.message };
  await audit(op.id, op.programId, 'closure_policy', before?.closure_policy, parsed.data, op.programId);
  revalidateAll();
  return { ok: true };
}

const reportPolicySchema = z.object({ mentee_confirm_signature: z.coerce.boolean().default(true), mentor_auto_sign: z.coerce.boolean().default(false) });

/** 행사 기본 서명 정책. 활성 행사 양식(그룹 null)에 멘토 서명 컬럼이 없으면 켤 수 없다. */
export async function updateRoundReportPolicyAction(input: unknown): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = reportPolicySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: '입력값을 확인하세요.' };
  const admin = createAdminClient();
  if (parsed.data.mentee_confirm_signature || parsed.data.mentor_auto_sign) {
    const { data: tpl } = await admin.from('document_templates').select('html_content').eq('program_id', op.programId).eq('template_key', ROUND_REPORT_TEMPLATE_KEY).is('support_type_id', null).eq('is_active', true).maybeSingle();
    const html = tpl?.html_content ?? null;
    // 행사 양식이 없으면 내장 기본 양식(멘토 서명 컬럼 포함)을 쓰므로 허용
    if (html && !templateHasSign(html, 'mentor')) return { ok: false, error: '행사 보고서 양식에 멘토 서명 컬럼({{{sign_mentor}}})이 없어 서명 정책을 켤 수 없습니다. 양식을 먼저 수정하세요.' };
  }
  const { data: before } = await admin.from('programs').select('round_report_policy').eq('id', op.programId).maybeSingle();
  const { error } = await admin.from('programs').update({ round_report_policy: parsed.data as Json }).eq('id', op.programId);
  if (error) return { ok: false, error: error.message };
  await audit(op.id, op.programId, 'round_report_policy', before?.round_report_policy, parsed.data, op.programId);
  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------- 보고서 양식 (행사/그룹)
const reportTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  support_type_id: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
  name: z.string().trim().min(1, '양식 이름을 입력하세요.'),
  html_content: z.string().min(20, '양식 HTML 을 입력하세요.'),
  is_active: z.coerce.boolean().default(true),
});

export async function saveReportTemplateAction(input: unknown): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = reportTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const d = parsed.data;
  if (d.support_type_id && !(await groupInProgram(d.support_type_id, op.programId))) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
  if (/<script[\s>]/i.test(d.html_content)) return { ok: false, error: '양식에 스크립트를 넣을 수 없습니다.' };
  const admin = createAdminClient();
  const row = {
    program_id: op.programId,
    support_type_id: d.support_type_id,
    template_key: ROUND_REPORT_TEMPLATE_KEY,
    name: d.name,
    html_content: d.html_content,
    is_active: d.is_active,
    updated_by: op.id,
    field_mapping: { has_sign_mentor: templateHasSign(d.html_content, 'mentor'), has_sign_mentee: templateHasSign(d.html_content, 'mentee') } as Json,
  };
  if (d.id) {
    const { data: before } = await admin.from('document_templates').select('*').eq('id', d.id).eq('program_id', op.programId).maybeSingle();
    if (!before) return { ok: false, error: '이 행사의 양식이 아닙니다.' };
    const { error } = await admin.from('document_templates').update(row).eq('id', d.id);
    if (error) return { ok: false, error: error.code === '23505' ? '같은 범위의 양식이 이미 있습니다.' : error.message };
    await audit(op.id, op.programId, 'report_template', { id: d.id, name: before.name, len: before.html_content.length }, { name: d.name, len: d.html_content.length, is_active: d.is_active }, d.id);
    revalidateAll();
    return { ok: true, id: d.id };
  }
  const { data, error } = await admin.from('document_templates').insert(row).select('id').single();
  if (error || !data) return { ok: false, error: error?.code === '23505' ? '같은 범위(행사/그룹)의 양식이 이미 있습니다. 기존 양식을 수정하세요.' : (error?.message ?? '저장 실패') };
  await audit(op.id, op.programId, 'report_template', null, { name: d.name, support_type_id: d.support_type_id }, data.id);
  revalidateAll();
  return { ok: true, id: data.id };
}

export async function deleteReportTemplateAction(id: string): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: row } = await admin.from('document_templates').select('id, name, support_type_id').eq('id', id).eq('program_id', op.programId).eq('template_key', ROUND_REPORT_TEMPLATE_KEY).maybeSingle();
  if (!row) return { ok: false, error: '이 행사의 양식이 아닙니다.' };
  await admin.from('document_templates').delete().eq('id', id);
  await audit(op.id, op.programId, 'report_template', row, null, id);
  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------- 만족도 양식 (응답 생기면 잠금 → 새 버전)
const questionSchema = z.object({
  qtype: z.enum(['scale', 'single', 'multi', 'text', 'rank']),
  label: z.string().trim().min(1, '문항 내용을 입력하세요.'),
  help: z.string().trim().optional().transform((v) => v || null),
  required: z.coerce.boolean().default(true),
  options: z.array(z.string().trim().min(1)).optional(),
  scale: z.object({ min: z.coerce.number().int(), max: z.coerce.number().int(), min_label: z.string().optional(), max_label: z.string().optional() }).optional(),
});
const surveyTemplateSchema = z.object({
  base_id: z.string().uuid().optional(),
  support_type_id: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
  name: z.string().trim().min(1, '양식 이름을 입력하세요.'),
  questions: z.array(questionSchema).min(1, '문항을 1개 이상 넣으세요.'),
});

/** 새 양식 또는 기존 양식의 새 버전 생성(이전 버전 비활성). 잠긴 양식은 수정 대신 새 버전. */
export async function saveSurveyTemplateAction(input: unknown): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = surveyTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const d = parsed.data;
  if (d.support_type_id && !(await groupInProgram(d.support_type_id, op.programId))) return { ok: false, error: '이 행사의 그룹이 아닙니다.' };
  for (const q of d.questions) {
    if ((q.qtype === 'single' || q.qtype === 'multi' || q.qtype === 'rank') && (!q.options || q.options.length < 2)) return { ok: false, error: `보기를 2개 이상 넣으세요: ${q.label}` };
    if (q.qtype === 'scale' && q.scale && q.scale.max <= q.scale.min) return { ok: false, error: `척도 범위를 확인하세요: ${q.label}` };
  }
  const admin = createAdminClient();
  let scopeQ = admin.from('survey_templates').select('id, version').eq('program_id', op.programId);
  scopeQ = d.support_type_id ? scopeQ.eq('support_type_id', d.support_type_id) : scopeQ.is('support_type_id', null);
  const { data: existing } = await scopeQ;
  const version = ((existing ?? []).reduce((m, t) => Math.max(m, t.version), 0) || 0) + 1;
  const { data: tpl, error } = await admin
    .from('survey_templates')
    .insert({ program_id: op.programId, support_type_id: d.support_type_id, name: d.name, version, is_active: true, created_by: op.id })
    .select('id')
    .single();
  if (error || !tpl) return { ok: false, error: error?.message ?? '저장 실패' };
  const qs = d.questions.map((q, i) => ({
    template_id: tpl.id,
    sort_order: i + 1,
    qtype: q.qtype,
    label: q.label,
    help: q.help,
    required: q.required,
    options: (q.qtype === 'scale' ? { min: q.scale?.min ?? 1, max: q.scale?.max ?? 5, min_label: q.scale?.min_label ?? '', max_label: q.scale?.max_label ?? '' } : q.qtype === 'text' ? null : (q.options ?? [])) as Json,
  }));
  const { error: qErr } = await admin.from('survey_questions').insert(qs);
  if (qErr) {
    await admin.from('survey_templates').delete().eq('id', tpl.id);
    return { ok: false, error: qErr.message };
  }
  // 같은 범위의 이전 버전 비활성
  if ((existing ?? []).length > 0) await admin.from('survey_templates').update({ is_active: false }).in('id', (existing ?? []).map((t) => t.id));
  await audit(op.id, op.programId, 'survey_template', d.base_id ? { base_id: d.base_id } : null, { id: tpl.id, version, questions: qs.length }, tpl.id);
  revalidateAll();
  return { ok: true, id: tpl.id };
}

export async function toggleSurveyTemplateAction(id: string, isActive: boolean): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: row } = await admin.from('survey_templates').select('id, is_active').eq('id', id).eq('program_id', op.programId).maybeSingle();
  if (!row) return { ok: false, error: '이 행사의 양식이 아닙니다.' };
  await admin.from('survey_templates').update({ is_active: isActive }).eq('id', id);
  await audit(op.id, op.programId, 'survey_template', { is_active: row.is_active }, { is_active: isActive }, id);
  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------- 키워드 사전
const tagSchema = z.object({ category: z.enum(['industry', 'expertise', 'stage', 'region', 'need', 'custom']), label: z.string().trim().min(1).max(40), sort_order: z.coerce.number().int().default(0) });

export async function addTagAction(input: unknown): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = tagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const { data, error } = await createAdminClient().from('tag_catalog').insert({ program_id: op.programId, ...parsed.data }).select('id').single();
  if (error || !data) return { ok: false, error: error?.code === '23505' ? '같은 키워드가 이미 있습니다.' : (error?.message ?? '저장 실패') };
  revalidateAll();
  return { ok: true, id: data.id };
}

export async function deleteTagAction(id: string): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: row } = await admin.from('tag_catalog').select('id').eq('id', id).eq('program_id', op.programId).maybeSingle();
  if (!row) return { ok: false, error: '이 행사의 키워드가 아닙니다.' };
  await admin.from('tag_catalog').delete().eq('id', id);
  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------- 담당 등급별 권한 (행사별 override)
/** 등급별 권한표 저장 — 메인 담당자(PL)만. { grade: [capability...] } */
export async function updateStaffPermissionsAction(input: unknown): Promise<Result> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  if (ctx.grade && ctx.grade !== 'pl') return { ok: false, error: '담당 등급별 권한은 메인 담당자(PL)만 변경할 수 있습니다.' };
  const parsed = z.record(z.string(), z.array(z.string())).safeParse(input);
  if (!parsed.success) return { ok: false, error: '입력값을 확인하세요.' };
  const valid = new Set(CAPABILITIES.map((c) => c.key as string));
  const clean: Record<string, string[]> = {};
  for (const g of STAFF_GRADES) {
    const list = parsed.data[g];
    if (Array.isArray(list)) clean[g] = list.filter((k) => valid.has(k));
  }
  // PL 은 항상 전체 권한 (잠금 방지)
  delete clean.pl;
  const admin = createAdminClient();
  const { data: before } = await admin.from('programs').select('staff_permissions').eq('id', ctx.programId).maybeSingle();
  // 등급 외 키(개인 override `user:<id>`, 발주처 옵션 `institution_docs_zip`·`institution_sms`)는 보존한다 (P30)
  const prev = (before?.staff_permissions && typeof before.staff_permissions === 'object' && !Array.isArray(before.staff_permissions) ? before.staff_permissions : {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...clean };
  for (const [k, v] of Object.entries(prev)) {
    if (k.startsWith('user:') || k === 'institution_docs_zip' || k === 'institution_sms') merged[k] = v;
  }
  const { error } = await admin.from('programs').update({ staff_permissions: merged as Json }).eq('id', ctx.programId);
  if (error) return { ok: false, error: error.message };
  await audit(profile.id, ctx.programId, 'staff_permissions', before?.staff_permissions, merged, ctx.programId);
  revalidateAll();
  revalidatePath('/', 'layout');
  return { ok: true };
}

const budgetsSchema = z.object({
  programBudget: z.number().min(0).nullable(),
  groups: z.array(z.object({ id: z.string().uuid(), budget: z.number().min(0).nullable() })).max(20),
});

/** 멘토링 예산 저장 (P22) — 행사 전체 + 그룹별. 금액 관련이므로 settings.money 권한. */
export async function saveBudgetsAction(input: unknown): Promise<Result> {
  const op = await operator('settings.money');
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = budgetsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: '입력값을 확인하세요.' };
  const admin = createAdminClient();

  const { data: before } = await admin.from('programs').select('mentoring_budget').eq('id', op.programId).maybeSingle();
  const { error: pErr } = await admin.from('programs').update({ mentoring_budget: parsed.data.programBudget }).eq('id', op.programId);
  if (pErr) return { ok: false, error: pErr.message };
  for (const g of parsed.data.groups) {
    const { error } = await admin.from('support_types').update({ mentoring_budget: g.budget }).eq('id', g.id).eq('program_id', op.programId);
    if (error) return { ok: false, error: error.message };
  }
  await audit(op.id, op.programId, 'mentoring_budget', before?.mentoring_budget ?? null, { program: parsed.data.programBudget, groups: parsed.data.groups.length });
  revalidateAll();
  revalidatePath('/nextlab/reports');
  revalidatePath('/institution/reports');
  revalidatePath('/institution/settlements');
  return { ok: true };
}

const matchingRulesSchema = z.object({
  groups: z.array(z.object({ id: z.string().uuid(), maxMenteesPerMentor: z.number().int().min(1).max(50) })).max(20),
});

/** 매칭 규칙 저장 (P25-04) — 라운드(그룹)별 멘토 1인당 최대 멘티 수 */
export async function saveMatchingRulesAction(input: unknown): Promise<Result> {
  const op = await operator('settings');
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = matchingRulesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: '1 이상 50 이하의 정수를 입력하세요.' };
  const admin = createAdminClient();
  const { data: before } = await admin.from('support_types').select('id, max_mentees_per_mentor').eq('program_id', op.programId);
  for (const g of parsed.data.groups) {
    const { error } = await admin.from('support_types').update({ max_mentees_per_mentor: g.maxMenteesPerMentor }).eq('id', g.id).eq('program_id', op.programId);
    if (error) return { ok: false, error: error.message };
  }
  await audit(op.id, op.programId, 'matching_rules', before, parsed.data.groups, op.programId);
  // 새 정원을 이미 넘긴 멘토 수 (그룹별 활성 배정) — 기존 배정은 유지되지만 추가 배정·추천에서 제외된다는 안내
  const capOf = new Map(parsed.data.groups.map((g) => [g.id, g.maxMenteesPerMentor]));
  const { data: active } = await admin.from('mentor_assignments').select('mentor_id, cases!inner(program_id, support_type_id)').eq('is_active', true).eq('cases.program_id', op.programId);
  const perMentorGroup = new Map<string, number>();
  for (const a of active ?? []) {
    const gid = (a.cases as unknown as { support_type_id: string } | null)?.support_type_id;
    if (!gid || !capOf.has(gid)) continue;
    const k = `${a.mentor_id}|${gid}`;
    perMentorGroup.set(k, (perMentorGroup.get(k) ?? 0) + 1);
  }
  const over = new Set<string>();
  perMentorGroup.forEach((n, k) => {
    const gid = k.split('|')[1]!;
    if (n > (capOf.get(gid) ?? Infinity)) over.add(k.split('|')[0]!);
  });
  revalidateAll();
  return { ok: true, message: over.size > 0 ? `저장했습니다. 새 정원을 이미 넘긴 멘토가 ${over.size}명 있습니다 — 기존 배정은 유지되며 추가 배정·자동 추천에서만 제외됩니다.` : undefined };
}
