import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@/types/database';
import { ROUND_REPORT_TEMPLATE_KEY } from '@/lib/documents/round-report';

export type ProgramRow = Tables<'programs'>;
export type GroupRow = Tables<'support_types'>;
export type GroupDocRow = Tables<'support_type_documents'>;
export type RateRow = Tables<'consulting_rates'>;
export type LimitRow = Tables<'operating_limits'>;
export type TagRow = Tables<'tag_catalog'>;
export type ReportTemplateRow = Tables<'document_templates'>;
export type SurveyTemplateRow = Tables<'survey_templates'>;
export type SurveyQuestionRow = Tables<'survey_questions'>;

export interface GroupWithDocs extends GroupRow {
  docs: GroupDocRow[];
  caseCount: number;
}

/** 운영 설정 화면 데이터 — 전부 행사 범위 (service_role + 코드 필터) */
export async function getProgramSettings(programId: string): Promise<ProgramRow | null> {
  const { data } = await createAdminClient().from('programs').select('*').eq('id', programId).maybeSingle();
  return data ?? null;
}

export async function listGroupsWithDocs(programId: string): Promise<GroupWithDocs[]> {
  const admin = createAdminClient();
  const { data: groups } = await admin.from('support_types').select('*').eq('program_id', programId).order('sort_order').order('created_at');
  const rows = groups ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((g) => g.id);
  const [{ data: docs }, { data: cases }] = await Promise.all([
    admin.from('support_type_documents').select('*').in('support_type_id', ids).order('sort_order'),
    admin.from('cases').select('support_type_id').in('support_type_id', ids),
  ]);
  const counts = new Map<string, number>();
  for (const c of cases ?? []) counts.set(c.support_type_id, (counts.get(c.support_type_id) ?? 0) + 1);
  return rows.map((g) => ({ ...g, docs: (docs ?? []).filter((d) => d.support_type_id === g.id), caseCount: counts.get(g.id) ?? 0 }));
}

export async function listRates(programId: string): Promise<RateRow[]> {
  const { data } = await createAdminClient().from('consulting_rates').select('*').eq('program_id', programId).order('effective_from', { ascending: false });
  return data ?? [];
}

export async function listLimits(programId: string): Promise<LimitRow[]> {
  const { data } = await createAdminClient().from('operating_limits').select('*').eq('program_id', programId).order('effective_from', { ascending: false });
  return data ?? [];
}

export async function listTags(programId: string): Promise<TagRow[]> {
  const { data } = await createAdminClient().from('tag_catalog').select('*').eq('program_id', programId).order('category').order('sort_order');
  return data ?? [];
}

export async function listReportTemplates(programId: string): Promise<ReportTemplateRow[]> {
  const { data } = await createAdminClient().from('document_templates').select('*').eq('program_id', programId).eq('template_key', ROUND_REPORT_TEMPLATE_KEY).order('created_at');
  return data ?? [];
}

export interface SurveyTemplateWithQuestions extends SurveyTemplateRow {
  questions: SurveyQuestionRow[];
  responseCount: number;
}

export async function listSurveyTemplates(programId: string): Promise<SurveyTemplateWithQuestions[]> {
  const admin = createAdminClient();
  const { data: templates } = await admin.from('survey_templates').select('*').eq('program_id', programId).order('support_type_id').order('version', { ascending: false });
  const rows = templates ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((t) => t.id);
  const [{ data: questions }, { data: responses }] = await Promise.all([
    admin.from('survey_questions').select('*').in('template_id', ids).order('sort_order'),
    admin.from('survey_responses').select('template_id').in('template_id', ids),
  ]);
  const counts = new Map<string, number>();
  for (const r of responses ?? []) counts.set(r.template_id, (counts.get(r.template_id) ?? 0) + 1);
  return rows.map((t) => ({ ...t, questions: (questions ?? []).filter((q) => q.template_id === t.id), responseCount: counts.get(t.id) ?? 0 }));
}
