'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless, CAPABILITIES, STAFF_GRADES } from '@/lib/auth/capabilities';

import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { policyFromParams } from '@/lib/settlement/compute';
import { ROUND_REPORT_TEMPLATE_KEY, templateHasSign } from '@/lib/documents/round-report';
import type { Json } from '@/types/database';

type Result = { ok: true; id?: string } | { ok: false; error: string };
const OPERATOR_ONLY = '운영사 담당자만 실행할 수 있습니다.';

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

async function audit(actorId: string, programId: string, key: string, before: unknown, after: unknown, entityId?: string) {
  await createAdminClient().from('audit_logs').insert({
    actor_id: actorId,
    program_id: programId,
    action: 'settings.update',
    entity_type: 'settings',
    entity_id: entityId ?? null,
    metadata: { key, before, after } as Json,
  });
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
});

export async function upsertGroupAction(input: unknown): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const d = parsed.data;
  const admin = createAdminClient();
  if (d.predecessor_support_type_id && !(await groupInProgram(d.predecessor_support_type_id, op.programId))) return { ok: false, error: '승계 원천 그룹이 이 행사의 그룹이 아닙니다.' };
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
    const { error } = await admin.from('support_types').update(row).eq('id', d.id);
    if (error) return { ok: false, error: error.code === '23505' ? '같은 코드의 그룹이 있습니다.' : error.message };
    await audit(op.id, op.programId, 'support_type', before, row, d.id);
    revalidateAll();
    return { ok: true, id: d.id };
  }
  const { data: ins, error } = await admin.from('support_types').insert(row).select('id').single();
  if (error || !ins) return { ok: false, error: error?.code === '23505' ? '같은 코드의 그룹이 있습니다.' : (error?.message ?? '저장 실패') };
  await audit(op.id, op.programId, 'support_type', null, row, ins.id);
  revalidateAll();
  return { ok: true, id: ins.id };
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
  const { error } = await admin.from('programs').update({ staff_permissions: clean as Json }).eq('id', ctx.programId);
  if (error) return { ok: false, error: error.message };
  await audit(profile.id, ctx.programId, 'staff_permissions', before?.staff_permissions, clean, ctx.programId);
  revalidateAll();
  revalidatePath('/', 'layout');
  return { ok: true };
}
