import { describe, expect, it } from 'vitest';

import { closureRoundBase, normalizeObservationTiming, observationEditable, observationUploadGate } from './observation-rule';

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

describe('관찰의견서 제출 시점 (라운드 설정, 2026-11-02)', () => {
  it('anytime 이면 회차가 하나도 없어도 열린다', () => {
    expect(observationUploadGate([], 3, 'anytime').ok).toBe(true);
  });
  it('after_rounds(기본)는 기존처럼 회차 보고서 전부 후', () => {
    expect(observationUploadGate([{ round_no: 1, report_registered_at: '2026-11-01' }], 3).ok).toBe(false);
    expect(observationUploadGate([{ round_no: 1, report_registered_at: '2026-11-01' }], 3, 'after_rounds').ok).toBe(false);
  });
  it('값 정규화 — 모르는 값은 after_rounds', () => {
    expect(normalizeObservationTiming('anytime')).toBe('anytime');
    expect(normalizeObservationTiming(null)).toBe('after_rounds');
    expect(normalizeObservationTiming('x')).toBe('after_rounds');
  });
});

describe('중도 종결 관찰의견서 (2026-11-23 면제 폐지)', () => {
  it('중도 종결 케이스는 검수 대기 중에도 관찰의견서를 올리고 바꿀 수 있다', () => {
    expect(observationEditable('closure_requested', true)).toBe(true);
    expect(observationEditable('closure_requested', false)).toBe(false);
    expect(observationEditable('settlement_pending', true)).toBe(false);
    expect(observationEditable('in_progress', true)).toBe(true);
  });
  it('기준 회차 = 중도 종결이면 등록된 회차(최소 1), 아니면 그룹 필수 회차', () => {
    expect(closureRoundBase(true, 2, 4)).toBe(2);
    expect(closureRoundBase(true, 0, 4)).toBe(1);
    expect(closureRoundBase(false, 2, 4)).toBe(4);
  });
  it('중도 종결 2회 진행(전부 보고서) — 모든 회차 후 업로드 그룹에서도 업로드가 열린다', () => {
    const rounds = [
      { round_no: 1, report_registered_at: 'x' },
      { round_no: 2, report_registered_at: 'x' },
    ];
    expect(observationUploadGate(rounds, closureRoundBase(true, rounds.length, 4)).ok).toBe(true);
    expect(observationUploadGate(rounds, closureRoundBase(false, rounds.length, 4)).ok).toBe(false);
  });
});
