import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@/types/database';

export type SurveyQuestion = Tables<'survey_questions'>;
export type SurveyTemplate = Tables<'survey_templates'>;
export type SurveyResponse = Tables<'survey_responses'>;

export interface CaseSurvey {
  template: SurveyTemplate;
  questions: SurveyQuestion[];
  response: SurveyResponse | null;
}

/**
 * 케이스에 노출되는 만족도 양식 = 그룹 지정 활성 템플릿 → 없으면 행사 공통 활성 템플릿 (docs §7-2).
 * 이미 응답이 있으면 그 응답의 템플릿을 그대로 쓴다(잠금본).
 */
export async function getCaseSurvey(caseId: string): Promise<CaseSurvey | null> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('program_id, support_type_id').eq('id', caseId).maybeSingle();
  if (!c) return null;
  const supabase = createClient();
  const { data: response } = await supabase.from('survey_responses').select('*').eq('case_id', caseId).maybeSingle();

  let template: SurveyTemplate | null = null;
  if (response) {
    const { data } = await admin.from('survey_templates').select('*').eq('id', response.template_id).maybeSingle();
    template = data ?? null;
  } else {
    const { data: rows } = await admin
      .from('survey_templates')
      .select('*')
      .eq('program_id', c.program_id)
      .eq('is_active', true)
      .order('version', { ascending: false });
    const list = rows ?? [];
    template = list.find((t) => t.support_type_id === c.support_type_id) ?? list.find((t) => t.support_type_id === null) ?? null;
  }
  if (!template) return null;
  const { data: questions } = await admin.from('survey_questions').select('*').eq('template_id', template.id).order('sort_order');
  return { template, questions: questions ?? [], response: response ?? null };
}

/** 척도 문항 옵션 파싱 */
export function scaleOptions(q: SurveyQuestion): { min: number; max: number; minLabel: string; maxLabel: string } {
  const o = (q.options && typeof q.options === 'object' && !Array.isArray(q.options) ? q.options : {}) as Record<string, unknown>;
  const min = Number(o.min ?? 1);
  const max = Number(o.max ?? 5);
  return {
    min: Number.isFinite(min) ? min : 1,
    max: Number.isFinite(max) && max > min ? max : 5,
    minLabel: typeof o.min_label === 'string' ? o.min_label : '',
    maxLabel: typeof o.max_label === 'string' ? o.max_label : '',
  };
}

/** 선택 문항 보기 목록 (문자열 배열 또는 {id,label}[]) */
export function choiceOptions(q: SurveyQuestion): { id: string; label: string }[] {
  const raw = Array.isArray(q.options) ? q.options : [];
  return raw
    .map((v, i) => {
      if (typeof v === 'string') return { id: v, label: v };
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        const label = typeof o.label === 'string' ? o.label : String(o.id ?? i);
        return { id: typeof o.id === 'string' ? o.id : label, label };
      }
      return null;
    })
    .filter((x): x is { id: string; label: string } => !!x);
}
