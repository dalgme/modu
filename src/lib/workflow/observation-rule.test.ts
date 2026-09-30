import { describe, expect, it } from 'vitest';

import { observationEditable, observationUploadGate } from './observation-rule';

const r = (n: number, reported: boolean) => ({ round_no: n, report_registered_at: reported ? '2026-09-01T00:00:00Z' : null });

describe('observationUploadGate', () => {
  it('필수 회차 보고서가 모두 등록되면 열린다', () => {
    expect(observationUploadGate([r(1, true), r(2, true), r(3, true), r(4, true)], 4).ok).toBe(true);
  });
  it('회차가 모자라거나 보고서가 없으면 닫힌다', () => {
    expect(observationUploadGate([r(1, true), r(2, true)], 4).ok).toBe(false);
    expect(observationUploadGate([r(1, true), r(2, true), r(3, true), r(4, false)], 4).ok).toBe(false);
  });
  it('추가 회차도 보고서가 있어야 한다', () => {
    const g = observationUploadGate([r(1, true), r(2, true), r(3, true), r(4, true), r(5, false)], 4);
    expect(g.ok).toBe(false);
    expect(g.hint).toContain('5회차');
  });
});

describe('observationEditable', () => {
  it('멘토 배정·진행 중·보완 요청에서만 수정·삭제 가능', () => {
    expect(observationEditable('mentor_assigned')).toBe(true);
    expect(observationEditable('in_progress')).toBe(true);
    expect(observationEditable('revision_requested')).toBe(true);
    expect(observationEditable('closure_requested')).toBe(false);
    expect(observationEditable('settlement_pending')).toBe(false);
    expect(observationEditable('withdrawn')).toBe(false);
  });
});
