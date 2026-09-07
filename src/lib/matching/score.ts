/**
 * AI 멘토 매칭 — 1단계 **객관 점수** (docs/MODU-DESIGN.md §14-2). 순수 함수·결정적. 모델 장애 시 이 점수만으로 추천한다.
 * 가중치는 이 파일의 상수 한 곳. 결과 objective 는 숫자·불리언만(재현 가능).
 */
export interface MenteeProfileInput {
  industry: string | null;
  stage: string | null;
  region: string | null;
  preferred_mode: 'online' | 'offline' | null;
  needs: string[];
  keywords: string[];
}

export interface MentorProfileInput {
  mentorId: string;
  industries: string[];
  expertise: string[];
  regions: string[];
  stages: string[];
  modes: ('online' | 'offline')[];
  keywords: string[];
  capacity: number;
  /** 현재 활성 배정 수 */
  currentLoad: number;
  /** 승계 원천 케이스의 멘토였는가 */
  priorMentorOfMentee: boolean;
}

export interface ObjectiveScore {
  tag_overlap: { need_expertise: number; industry: number; keyword: number };
  region_match: boolean;
  mode_match: boolean;
  stage_match: boolean;
  load: { current: number; capacity: number; ratio: number };
  prior_mentor: boolean;
  over_capacity: boolean;
}

export const WEIGHTS = {
  needExpertisePerTag: 15,
  needExpertiseMax: 45,
  industry: 12,
  keywordPerTag: 4,
  keywordMax: 12,
  stage: 8,
  region: 10,
  mode: 5,
  prior: 10,
  loadPenaltyMax: 20,
} as const;

const norm = (s: string) => s.trim().toLowerCase();
function overlap(a: string[], b: string[]): number {
  const set = new Set(b.map(norm));
  return a.map(norm).filter((x) => x && set.has(x)).length;
}

export function scoreMentor(mentee: MenteeProfileInput, mentor: MentorProfileInput): { score: number; objective: ObjectiveScore } {
  const needExp = overlap(mentee.needs, mentor.expertise);
  const industry = mentee.industry ? overlap([mentee.industry], mentor.industries) : 0;
  const keyword = overlap(mentee.keywords, mentor.keywords);
  const region = !!mentee.region && mentor.regions.map(norm).includes(norm(mentee.region));
  const mode = !mentee.preferred_mode || mentor.modes.includes(mentee.preferred_mode);
  const stage = !!mentee.stage && mentor.stages.map(norm).includes(norm(mentee.stage));
  const capacity = Math.max(0, mentor.capacity);
  const ratio = capacity > 0 ? mentor.currentLoad / capacity : 1;
  const overCapacity = capacity > 0 ? mentor.currentLoad >= capacity : true;

  let score = 0;
  score += Math.min(WEIGHTS.needExpertiseMax, needExp * WEIGHTS.needExpertisePerTag);
  score += industry > 0 ? WEIGHTS.industry : 0;
  score += Math.min(WEIGHTS.keywordMax, keyword * WEIGHTS.keywordPerTag);
  score += stage ? WEIGHTS.stage : 0;
  score += region ? WEIGHTS.region : 0;
  score += mode ? WEIGHTS.mode : 0;
  score += mentor.priorMentorOfMentee ? WEIGHTS.prior : 0;
  score -= Math.round(Math.min(1, ratio) * WEIGHTS.loadPenaltyMax);
  if (overCapacity) score -= 10;
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    objective: {
      tag_overlap: { need_expertise: needExp, industry, keyword },
      region_match: region,
      mode_match: mode,
      stage_match: stage,
      load: { current: mentor.currentLoad, capacity, ratio: Math.round(ratio * 100) / 100 },
      prior_mentor: mentor.priorMentorOfMentee,
      over_capacity: overCapacity,
    },
  };
}

/** 후보 상위 N — 점수 내림차순, 동점이면 부하 낮은 순 */
export function rankMentors(mentee: MenteeProfileInput, mentors: MentorProfileInput[], topN = 8): { mentorId: string; score: number; objective: ObjectiveScore }[] {
  return mentors
    .map((m) => ({ mentorId: m.mentorId, ...scoreMentor(mentee, m) }))
    .sort((a, b) => b.score - a.score || a.objective.load.ratio - b.objective.load.ratio)
    .slice(0, topN);
}
