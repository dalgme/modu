import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OBS_REQUEST_TEMPLATE,
  excludedFromFileCounts,
  isObservationMissing,
  renderObservationRequest,
  validateObservationRequest,
} from './observation-missing-shared';

describe('보고서 파일 탭 멘티 수 — 진행 없이 끝난 멘티만 뺀다', () => {
  const base = { menteeInactive: false, outcome: null, status: 'in_progress', progressedRounds: 0 };
  it('진행 중 멘티는 센다(회차 0회여도)', () => {
    expect(excludedFromFileCounts(base)).toBe(false);
  });
  it('회차 없이 포기·종료 표시 / 중도 종료 / 비활성화 → 뺀다', () => {
    expect(excludedFromFileCounts({ ...base, outcome: 'gave_up' })).toBe(true);
    expect(excludedFromFileCounts({ ...base, outcome: 'ended' })).toBe(true);
    expect(excludedFromFileCounts({ ...base, status: 'withdrawn' })).toBe(true);
    expect(excludedFromFileCounts({ ...base, menteeInactive: true })).toBe(true);
  });
  it('1회 이상 진행 후 포기·종료·비활성화 → 센다', () => {
    expect(excludedFromFileCounts({ ...base, outcome: 'gave_up', progressedRounds: 1 })).toBe(false);
    expect(excludedFromFileCounts({ ...base, outcome: 'ended', status: 'withdrawn', progressedRounds: 2 })).toBe(false);
    expect(excludedFromFileCounts({ ...base, menteeInactive: true, progressedRounds: 1 })).toBe(false);
  });
});

describe('관찰의견서 미제출', () => {
  const base = { status: 'in_progress', observationRequired: true, hasObservation: false, earlyClosure: false, countedInFiles: true };
  it('진행 단계 · 파일 없음 → 미제출', () => {
    expect(isObservationMissing(base)).toBe(true);
    expect(isObservationMissing({ ...base, status: 'revision_requested' })).toBe(true);
  });
  it('제출함 · 관찰의견서 없는 라운드 · 중도 종결 · 검수 승인 이후 · 멘티 수에서 뺀 멘티 → 아님', () => {
    expect(isObservationMissing({ ...base, hasObservation: true })).toBe(false);
    expect(isObservationMissing({ ...base, observationRequired: false })).toBe(false);
    expect(isObservationMissing({ ...base, earlyClosure: true })).toBe(false);
    expect(isObservationMissing({ ...base, status: 'settlement_batched' })).toBe(false);
    expect(isObservationMissing({ ...base, status: 'withdrawn' })).toBe(false);
    expect(isObservationMissing({ ...base, countedInFiles: false })).toBe(false);
  });
});

describe('요청 문자 문구', () => {
  it('기본 문구 — 멘토 이름·수·멘티 목록·주소', () => {
    const t = renderObservationRequest(null, { program: '행사', name: '홍길동', mentees: ['김하나', '이둘'], link: 'https://x/mentor/dashboard' });
    expect(t).toContain('[행사] 홍길동 멘토님');
    expect(t).toContain('멘티 2명:\n· 김하나\n· 이둘');
    expect(t).toContain('https://x/mentor/dashboard');
    expect(renderObservationRequest(DEFAULT_OBS_REQUEST_TEMPLATE, { program: '행사', name: '홍길동', mentees: ['김하나'], link: 'l' })).toBe(renderObservationRequest('', { program: '행사', name: '홍길동', mentees: ['김하나'], link: 'l' }));
  });
  it('11명 이상이면 10명 + "외 N명"', () => {
    const t = renderObservationRequest('{mentees}', { program: '', name: '', mentees: Array.from({ length: 12 }, (_, i) => `멘티${i + 1}`), link: '' });
    expect(t.split('\n')).toHaveLength(11);
    expect(t.endsWith('외 2명')).toBe(true);
  });
  it('검사 — 빈 문구·모르는 필드·길이', () => {
    expect(validateObservationRequest('  ')).toBeTruthy();
    expect(validateObservationRequest('{name} {deadline}')).toContain('{deadline}');
    expect(validateObservationRequest('가'.repeat(1001))).toBeTruthy();
    expect(validateObservationRequest(DEFAULT_OBS_REQUEST_TEMPLATE)).toBeNull();
  });
});
