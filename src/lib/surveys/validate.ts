/**
 * 조사 응답 검증 — 문항 유형 5종. 케이스 만족도(submitSurvey)와 조사 캠페인이 같은 규칙을 쓴다.
 * 클라이언트·서버 공용 순수 함수.
 */
import type { Json, Tables } from '@/types/database';

export type SurveyQuestionRow = Tables<'survey_questions'>;

export function parseScale(q: SurveyQuestionRow): { min: number; max: number; minLabel: string; maxLabel: string } {
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

export function parseChoices(q: SurveyQuestionRow): { id: string; label: string }[] {
  const raw = Array.isArray(q.options) ? q.options : [];
  return raw
    .map((x, i) => {
      if (typeof x === 'string') return { id: String(i), label: x };
      if (x && typeof x === 'object' && !Array.isArray(x)) {
        const o = x as Record<string, unknown>;
        return { id: String(o.id ?? i), label: String(o.label ?? '') };
      }
      return null;
    })
    .filter((x): x is { id: string; label: string } => !!x && !!x.label);
}

export type ValidateResult = { ok: true; clean: Record<string, Json>; score: number | null } | { ok: false; error: string };

export function validateAnswers(questions: SurveyQuestionRow[], answers: Record<string, unknown>): ValidateResult {
  const clean: Record<string, Json> = {};
  const scaleValues: number[] = [];
  for (const q of questions) {
    const v = answers[q.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (q.required) return { ok: false, error: `필수 문항에 답해 주세요: ${q.label}` };
      continue;
    }
    switch (q.qtype) {
      case 'scale': {
        const { min, max } = parseScale(q);
        const n = Number(v);
        if (!Number.isInteger(n) || n < min || n > max) return { ok: false, error: `척도 범위를 벗어났습니다: ${q.label}` };
        clean[q.id] = n;
        scaleValues.push(n);
        break;
      }
      case 'single': {
        const ids = new Set(parseChoices(q).map((o) => o.id));
        if (typeof v !== 'string' || !ids.has(v)) return { ok: false, error: `보기에서 선택하세요: ${q.label}` };
        clean[q.id] = v;
        break;
      }
      case 'multi':
      case 'rank': {
        const ids = new Set(parseChoices(q).map((o) => o.id));
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !ids.has(x))) return { ok: false, error: `보기에서 선택하세요: ${q.label}` };
        if (q.qtype === 'rank' && new Set(v).size !== v.length) return { ok: false, error: `순위가 중복되었습니다: ${q.label}` };
        clean[q.id] = v as string[];
        break;
      }
      case 'text': {
        if (typeof v !== 'string') return { ok: false, error: `텍스트로 답해 주세요: ${q.label}` };
        clean[q.id] = v.trim().slice(0, 2000);
        break;
      }
      default:
        break;
    }
  }
  const score = scaleValues.length ? Math.round((scaleValues.reduce((a, b) => a + b, 0) / scaleValues.length) * 100) / 100 : null;
  return { ok: true, clean, score };
}

// ── 실시간 분석 집계 (문항별)
export interface QuestionAggregate {
  id: string;
  label: string;
  qtype: string;
  n: number;
  /** scale */
  avg?: number | null;
  distribution?: { value: number; count: number }[];
  /** single·multi·rank(1순위 기준 + 가중) */
  choices?: { id: string; label: string; count: number; weighted?: number }[];
  /** text */
  texts?: string[];
}

export function aggregateAnswers(questions: SurveyQuestionRow[], answersList: Record<string, unknown>[]): QuestionAggregate[] {
  return questions.map((q) => {
    const values = answersList.map((a) => a[q.id]).filter((v) => v !== undefined && v !== null && v !== '');
    const base: QuestionAggregate = { id: q.id, label: q.label, qtype: q.qtype, n: values.length };
    if (q.qtype === 'scale') {
      const { min, max } = parseScale(q);
      const nums = values.map(Number).filter((n) => Number.isFinite(n));
      base.avg = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null;
      base.distribution = Array.from({ length: max - min + 1 }, (_, i) => ({ value: min + i, count: nums.filter((n) => n === min + i).length }));
    } else if (q.qtype === 'single') {
      base.choices = parseChoices(q).map((o) => ({ ...o, count: values.filter((v) => v === o.id).length }));
    } else if (q.qtype === 'multi') {
      base.choices = parseChoices(q).map((o) => ({ ...o, count: values.filter((v) => Array.isArray(v) && v.includes(o.id)).length }));
    } else if (q.qtype === 'rank') {
      // count = 1순위로 꼽힌 횟수, weighted = 순위 가중 점수(1위 = 보기 수, 꼴찌 = 1)
      const opts = parseChoices(q);
      base.choices = opts.map((o) => {
        let first = 0;
        let weighted = 0;
        for (const v of values) {
          if (!Array.isArray(v)) continue;
          const idx = v.indexOf(o.id);
          if (idx === 0) first += 1;
          if (idx >= 0) weighted += opts.length - idx;
        }
        return { ...o, count: first, weighted };
      });
    } else if (q.qtype === 'text') {
      base.texts = values.filter((v): v is string => typeof v === 'string').slice(0, 200);
    }
    return base;
  });
}
