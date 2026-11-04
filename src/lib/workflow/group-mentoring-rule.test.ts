import { describe, expect, it } from 'vitest';

import { groupMentoringSetting, groupSessionEditable, groupSessionLimitError, pickGroupFeeHolder, planGroupFee, type GroupFeeLog } from './group-mentoring-rule';

const log = (id: string, p: Partial<GroupFeeLog> = {}): GroupFeeLog => ({ id, settled: false, amount: 0, unitPrice: 0, reportedAt: null, holder: false, seq: 0, ...p });
const FULL = { unitPrice: 80000, amount: 160000 };

describe('그룹멘토링 수당 대표 회차', () => {
  it('보고서가 없으면 첫 참여 회차가 대표 — 1회분만 금액', () => {
    const logs = [log('a', { seq: 0 }), log('b', { seq: 1 }), log('c', { seq: 2 })];
    expect(pickGroupFeeHolder(logs)).toBe('a');
    const plan = planGroupFee(logs, FULL);
    expect(plan.filter((u) => u.amount > 0)).toEqual([{ id: 'a', holder: true, unitPrice: 80000, amount: 160000 }]);
    // 나머지는 이미 0원이라 변경 없음
    expect(plan).toHaveLength(1);
  });

  it('대표가 보고서를 안 올려도 먼저 보고서가 등록된 회차로 수당이 옮겨 간다', () => {
    const logs = [log('a', { seq: 0, holder: true, amount: 160000, unitPrice: 80000 }), log('b', { seq: 1, reportedAt: '2026-11-04T05:00:00Z' })];
    expect(pickGroupFeeHolder(logs)).toBe('b');
    const plan = planGroupFee(logs, FULL);
    expect(plan).toEqual([
      { id: 'a', holder: false, unitPrice: 0, amount: 0 },
      { id: 'b', holder: true, unitPrice: 80000, amount: 160000 },
    ]);
    const total = logs.map((l) => plan.find((u) => u.id === l.id)?.amount ?? l.amount).reduce((s, x) => s + x, 0);
    expect(total).toBe(160000);
  });

  it('보고서 등록 대표는 다른 멘티가 나중에 올려도 유지', () => {
    const logs = [log('a', { seq: 0, holder: true, amount: 160000, unitPrice: 80000, reportedAt: '2026-11-04T06:00:00Z' }), log('b', { seq: 1, reportedAt: '2026-11-04T05:00:00Z' })];
    expect(pickGroupFeeHolder(logs)).toBe('a');
    expect(planGroupFee(logs, FULL)).toEqual([]);
  });

  it('정산 확정된 대표가 있으면 나머지는 0원 그대로, 확정본은 건드리지 않는다', () => {
    const logs = [log('a', { settled: true, holder: true, amount: 160000, unitPrice: 80000 }), log('b', { reportedAt: '2026-11-04T05:00:00Z', amount: 160000, unitPrice: 80000 })];
    expect(pickGroupFeeHolder(logs)).toBe('a');
    expect(planGroupFee(logs, FULL)).toEqual([{ id: 'b', holder: false, unitPrice: 0, amount: 0 }]);
  });

  it('단가가 바뀌면 대표 금액만 다시 계산', () => {
    const logs = [log('a', { holder: true, amount: 100000, unitPrice: 100000 }), log('b', { seq: 1 })];
    expect(planGroupFee(logs, FULL)).toEqual([{ id: 'a', holder: true, unitPrice: 80000, amount: 160000 }]);
  });
});

describe('그룹멘토링 라운드 설정·횟수 제한', () => {
  it('꺼져 있거나 0회면 사용 안 함', () => {
    expect(groupMentoringSetting(null)).toEqual({ enabled: false, maxPerMentor: 0 });
    expect(groupMentoringSetting({ group_mentoring_enabled: true, group_mentoring_max_per_mentor: 0 }).enabled).toBe(false);
    expect(groupMentoringSetting({ group_mentoring_enabled: true, group_mentoring_max_per_mentor: 2 })).toEqual({ enabled: true, maxPerMentor: 2 });
  });
  it('멘토당 O회 제한', () => {
    expect(groupSessionLimitError(0, 1)).toBeNull();
    expect(groupSessionLimitError(1, 1)).toContain('1회까지');
    expect(groupSessionLimitError(1, 2)).toBeNull();
  });
  it('보고서·정산 회차가 있으면 세션 일정 수정 불가', () => {
    expect(groupSessionEditable([{ reported: false, settled: false }, { reported: false, settled: false }])).toBe(true);
    expect(groupSessionEditable([{ reported: true, settled: false }, { reported: false, settled: false }])).toBe(false);
  });
});
