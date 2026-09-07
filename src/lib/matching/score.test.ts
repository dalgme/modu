import { describe, expect, it } from 'vitest';

import { rankMentors, scoreMentor, WEIGHTS, type MenteeProfileInput, type MentorProfileInput } from './score';

const mentee: MenteeProfileInput = { industry: '식품', stage: '초기창업', region: '세종', preferred_mode: 'offline', needs: ['마케팅', '재무'], keywords: ['온라인 판로'] };
const base: MentorProfileInput = { mentorId: 'a', industries: [], expertise: [], regions: [], stages: [], modes: ['online', 'offline'], keywords: [], capacity: 5, currentLoad: 0, priorMentorOfMentee: false };

describe('scoreMentor', () => {
  it('아무 것도 겹치지 않으면 유형 일치 점수만', () => {
    const r = scoreMentor(mentee, base);
    expect(r.score).toBe(WEIGHTS.mode);
    expect(r.objective.tag_overlap.need_expertise).toBe(0);
  });
  it('필요분야·업종·지역·단계·키워드가 모두 맞으면 상한 안에서 합산', () => {
    const r = scoreMentor(mentee, { ...base, expertise: ['마케팅', '재무', '법무'], industries: ['식품'], regions: ['세종'], stages: ['초기창업'], keywords: ['온라인 판로'] });
    expect(r.objective.tag_overlap.need_expertise).toBe(2);
    expect(r.score).toBe(30 + 12 + 4 + 8 + 10 + 5);
  });
  it('부하가 꽉 차면 감점되고 over_capacity 표시', () => {
    const full = scoreMentor(mentee, { ...base, expertise: ['마케팅', '재무', '법무'], currentLoad: 5 });
    const free = scoreMentor(mentee, { ...base, expertise: ['마케팅', '재무', '법무'] });
    expect(full.objective.over_capacity).toBe(true);
    expect(free.score - full.score).toBe(WEIGHTS.loadPenaltyMax + 10);
  });
  it('승계 이전 멘토 가점, 선호 유형 불일치 시 유형 점수 없음', () => {
    const prior = scoreMentor(mentee, { ...base, priorMentorOfMentee: true, modes: ['online'] });
    expect(prior.score).toBe(WEIGHTS.prior);
    expect(prior.objective.mode_match).toBe(false);
  });
  it('점수는 0~100 으로 잘린다', () => {
    const r = scoreMentor(mentee, { ...base, capacity: 0, currentLoad: 3 });
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

describe('rankMentors', () => {
  it('점수순, 동점이면 부하 낮은 순, topN 제한', () => {
    const list = rankMentors(
      mentee,
      [
        { ...base, mentorId: 'x', expertise: ['마케팅'], currentLoad: 2 },
        { ...base, mentorId: 'y', expertise: ['마케팅'], currentLoad: 0 },
        { ...base, mentorId: 'z', expertise: ['마케팅', '재무'] },
      ],
      2,
    );
    expect(list.map((m) => m.mentorId)).toEqual(['z', 'y']);
  });
});
