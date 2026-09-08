import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';
import { rankMentors, type MenteeProfileInput, type MentorProfileInput, type ObjectiveScore } from '@/lib/matching/score';
import type { Json, Tables } from '@/types/database';

export const MATCH_MODEL = 'claude-opus-5';
export const MATCH_PROMPT_VERSION = 'v1-2026-09';

export interface RecommendationItem {
  id: string;
  mentorId: string;
  mentorName: string;
  rank: number;
  score: number;
  objective: ObjectiveScore;
  rationale: string | null;
  model: string | null;
  generatedAt: string;
  adoptedAt: string | null;
  /** 현재 활성 배정 수 / 수용량 (화면 표시) */
  load: string;
}

const RationaleSchema = z.object({
  ranking: z.array(
    z.object({
      mentor_id: z.string(),
      rank: z.number().int().min(1),
      rationale: z.string(),
      caution: z.string().optional(),
    }),
  ),
});

/** 케이스 + 멘티 프로필 + 행사 멘토 프로필 로드 */
async function loadInputs(caseId: string) {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, program_id, support_type_id, business_name, predecessor_case_id, item, business_type').eq('id', caseId).maybeSingle();
  if (!c) return null;
  const [{ data: prof }, { data: members }, { data: assigns }, priorMentor] = await Promise.all([
    admin.from('mentee_profiles').select('*').eq('case_id', caseId).maybeSingle(),
    admin.from('program_members').select('user_id, users!inner(id, name, is_active)').eq('program_id', c.program_id).eq('role', 'mentor').eq('is_active', true),
    admin.from('mentor_assignments').select('mentor_id, case_id').eq('is_active', true),
    c.predecessor_case_id
      ? admin.from('mentor_assignments').select('mentor_id').eq('case_id', c.predecessor_case_id).order('is_active', { ascending: false }).order('assigned_at', { ascending: false }).limit(1).maybeSingle().then((r) => r.data?.mentor_id ?? null)
      : Promise.resolve(null as string | null),
  ]);
  const mentorUsers = (members ?? []).map((m) => m.users as unknown as { id: string; name: string; is_active: boolean }).filter((u) => u.is_active);
  const mentorIds = mentorUsers.map((u) => u.id);
  const { data: profiles } = mentorIds.length ? await admin.from('mentor_profiles').select('*').eq('program_id', c.program_id).in('user_id', mentorIds) : { data: [] as Tables<'mentor_profiles'>[] };
  // 부하: 이 행사 케이스의 활성 배정만
  const { data: programCases } = await admin.from('cases').select('id').eq('program_id', c.program_id);
  const inProgram = new Set((programCases ?? []).map((x) => x.id));
  const load = new Map<string, number>();
  for (const a of assigns ?? []) if (inProgram.has(a.case_id)) load.set(a.mentor_id, (load.get(a.mentor_id) ?? 0) + 1);

  const mentee: MenteeProfileInput = {
    industry: prof?.industry ?? c.business_type ?? null,
    stage: prof?.stage ?? null,
    region: prof?.region ?? null,
    preferred_mode: prof?.preferred_mode ?? null,
    needs: prof?.needs ?? [],
    keywords: prof?.keywords ?? [],
  };
  const mentors: MentorProfileInput[] = mentorUsers.map((u) => {
    const p = (profiles ?? []).find((x) => x.user_id === u.id);
    return {
      mentorId: u.id,
      industries: p?.industries ?? [],
      expertise: p?.expertise ?? [],
      regions: p?.regions ?? [],
      stages: p?.stages ?? [],
      modes: p?.modes ?? ['online', 'offline'],
      keywords: p?.keywords ?? [],
      capacity: p?.capacity ?? 5,
      currentLoad: load.get(u.id) ?? 0,
      priorMentorOfMentee: priorMentor === u.id,
    };
  });
  return { c, prof, mentee, mentors, mentorUsers, profiles: profiles ?? [] };
}

/**
 * 추천 생성 (docs §14-2): 객관 점수 상위 8 → (키 있으면) Claude 정성 근거 → match_recommendations 저장.
 * 자동 배정 없음. 개인정보(연락처·사업자번호)는 프롬프트에 넣지 않는다.
 */
export async function generateRecommendations(caseId: string, actorId: string): Promise<{ ok: true; items: RecommendationItem[]; usedModel: boolean } | { ok: false; error: string }> {
  const inputs = await loadInputs(caseId);
  if (!inputs) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const { c, prof, mentee, mentors, mentorUsers, profiles } = inputs;
  if (mentors.length === 0) return { ok: false, error: '이 행사에 활성 멘토가 없습니다.' };
  const ranked = rankMentors(mentee, mentors, 8);
  const nameOf = new Map(mentorUsers.map((u) => [u.id, u.name]));

  // 2) 정성 근거 (모델) — 키 없거나 실패하면 객관 점수만
  let rationales = new Map<string, { rationale: string; rank: number }>();
  let usedModel = false;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const candidates = ranked.map((r) => {
        const p = profiles.find((x) => x.user_id === r.mentorId);
        return { mentor_id: r.mentorId, objective_score: r.score, expertise: p?.expertise ?? [], industries: p?.industries ?? [], stages: p?.stages ?? [], regions: p?.regions ?? [], keywords: p?.keywords ?? [], career: (p?.career ?? '').slice(0, 600), bio: (p?.bio ?? '').slice(0, 600), load: `${r.objective.load.current}/${r.objective.load.capacity}` };
      });
      const menteeDesc = { business_type: mentee.industry, stage: mentee.stage, region: mentee.region, preferred_mode: mentee.preferred_mode, needs: mentee.needs, keywords: mentee.keywords, item: c.item, summary: (prof?.summary ?? '').slice(0, 1200) };
      const response = await client.messages.parse({
        model: MATCH_MODEL,
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium', format: zodOutputFormat(RationaleSchema) },
        system:
          '당신은 창업 멘토링 프로그램의 멘토 매칭 보조자입니다. 운영 담당자가 최종 배정을 결정하며, 당신은 후보 멘토를 순위화하고 근거를 제시합니다. ' +
          '객관 점수(태그 겹침·지역·유형·부하)를 존중하되 경력·소개 텍스트로 드러나는 적합성을 보태어 상위 3~5명만 순위화하세요. ' +
          '근거는 한국어 2~4문장, 멘티의 필요와 멘토의 강점을 구체적으로 연결하고, 부하가 높거나 유형이 맞지 않으면 caution 에 적으세요. 후보에 없는 멘토를 만들지 마세요.',
        messages: [
          {
            role: 'user',
            content: `멘티(기업·팀) 정보:\n${JSON.stringify(menteeDesc, null, 1)}\n\n후보 멘토(객관 점수 순):\n${JSON.stringify(candidates, null, 1)}`,
          },
        ],
      });
      const parsed = response.parsed_output;
      if (parsed) {
        const ids = new Set(ranked.map((r) => r.mentorId));
        rationales = new Map(parsed.ranking.filter((r) => ids.has(r.mentor_id)).map((r) => [r.mentor_id, { rationale: r.caution ? `${r.rationale}\n주의: ${r.caution}` : r.rationale, rank: r.rank }]));
        usedModel = rationales.size > 0;
      }
    } catch {
      usedModel = false;
    }
  }

  // 최종 순위: 모델이 순위를 준 멘토를 앞에(모델 순위순), 나머지는 객관 점수순
  const withModel = ranked.filter((r) => rationales.has(r.mentorId)).sort((a, b) => rationales.get(a.mentorId)!.rank - rationales.get(b.mentorId)!.rank);
  const rest = ranked.filter((r) => !rationales.has(r.mentorId));
  const final = [...withModel, ...rest];
  const generatedAt = new Date().toISOString();
  const admin = createAdminClient();
  const rows = final.map((r, i) => ({
    program_id: c.program_id,
    case_id: c.id,
    mentor_id: r.mentorId,
    rank: i + 1,
    score: r.score,
    objective: r.objective as unknown as Json,
    rationale: rationales.get(r.mentorId)?.rationale ?? null,
    model: rationales.has(r.mentorId) ? MATCH_MODEL : null,
    prompt_version: usedModel ? MATCH_PROMPT_VERSION : null,
    generated_at: generatedAt,
    generated_by: actorId,
  }));
  const { error } = await admin.from('match_recommendations').insert(rows);
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: 'match.recommend', entity_type: 'cases', entity_id: c.id, metadata: { candidates: rows.length, used_model: usedModel, model: usedModel ? MATCH_MODEL : null } });
  return {
    ok: true,
    usedModel,
    items: rows.map((r, i) => ({ id: '', mentorId: r.mentor_id, mentorName: nameOf.get(r.mentor_id) ?? '-', rank: i + 1, score: r.score, objective: final[i]!.objective, rationale: r.rationale, model: r.model, generatedAt, adoptedAt: null, load: `${final[i]!.objective.load.current}/${final[i]!.objective.load.capacity}` })),
  };
}

/** 최신 추천 묶음 (같은 generated_at) */
export async function listLatestRecommendations(caseId: string): Promise<RecommendationItem[]> {
  const admin = createAdminClient();
  const { data: latest } = await admin.from('match_recommendations').select('generated_at').eq('case_id', caseId).order('generated_at', { ascending: false }).limit(1).maybeSingle();
  if (!latest) return [];
  const { data: rows } = await admin.from('match_recommendations').select('*').eq('case_id', caseId).eq('generated_at', latest.generated_at).order('rank');
  const list = rows ?? [];
  if (list.length === 0) return [];
  const { data: users } = await admin.from('users').select('id, name').in('id', list.map((r) => r.mentor_id));
  const names = new Map((users ?? []).map((u) => [u.id, u.name]));
  return list.map((r) => {
    const obj = r.objective as unknown as ObjectiveScore;
    return { id: r.id, mentorId: r.mentor_id, mentorName: names.get(r.mentor_id) ?? '-', rank: r.rank, score: Number(r.score), objective: obj, rationale: r.rationale, model: r.model, generatedAt: r.generated_at, adoptedAt: r.adopted_at, load: `${obj?.load?.current ?? '-'}/${obj?.load?.capacity ?? '-'}` };
  });
}

/** 추천으로 배정했을 때 채택 기록 (§14-3) — 배정 액션이 호출 */
export async function markRecommendationAdopted(caseId: string, mentorId: string): Promise<number | null> {
  const admin = createAdminClient();
  const { data: latest } = await admin.from('match_recommendations').select('id, rank').eq('case_id', caseId).eq('mentor_id', mentorId).is('adopted_at', null).order('generated_at', { ascending: false }).limit(1).maybeSingle();
  if (!latest) return null;
  await admin.from('match_recommendations').update({ adopted_at: new Date().toISOString() }).eq('id', latest.id);
  return latest.rank;
}
