import { describe, expect, it } from 'vitest';

import { hideSupersededProgress, isProgressAction } from './progress-reset';

const row = (action: string, created_at: string) => ({ action, created_at });

describe('hideSupersededProgress', () => {
  it('초기화 기록이 없으면 그대로', () => {
    const rows = [row('round.create', '2026-09-29T01:00:00Z'), row('case.create', '2026-09-22T01:00:00Z')];
    expect(hideSupersededProgress(rows)).toEqual(rows);
  });
  it('초기화 이전 진행 기록만 숨기고 등록·배정·사업계획서·이후 기록은 남긴다', () => {
    const rows = [
      row('case.create', '2026-09-22T01:00:00Z'),
      row('case.assign_mentor', '2026-09-22T02:00:00Z'),
      row('round.create', '2026-09-29T01:00:00Z'),
      row('round.report', '2026-09-29T02:00:00Z'),
      row('case.closure_requested', '2026-09-29T03:00:00Z'),
      row('case.review_revision', '2026-09-29T04:00:00Z'),
      row('files.business_plan_upload', '2026-09-30T01:00:00Z'),
      row('case.progress_reset', '2026-09-30T03:00:00Z'),
      row('round.create', '2026-10-02T01:00:00Z'),
    ];
    expect(hideSupersededProgress(rows).map((r) => r.action)).toEqual([
      'case.create',
      'case.assign_mentor',
      'files.business_plan_upload',
      'case.progress_reset',
      'round.create',
    ]);
  });
  it('진행 기록 판정', () => {
    expect(isProgressAction('observation.upload')).toBe(true);
    expect(isProgressAction('case.closure_requested')).toBe(true);
    expect(isProgressAction('case.assign_mentor')).toBe(false);
    expect(isProgressAction('match.auto_assign')).toBe(false);
  });
});
