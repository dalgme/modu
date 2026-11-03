import { describe, expect, it } from 'vitest';

import { classifyCase, computeRoundProgress, type RPCaseInput, type RPLogInput } from './round-progress-shared';

const now = new Date('2026-11-03T12:00:00Z');
const past = (d: number) => ({ startedAt: `2026-10-${String(d).padStart(2, '0')}T01:00:00Z`, endedAt: `2026-10-${String(d).padStart(2, '0')}T02:00:00Z` });
const future = { startedAt: '2026-11-10T01:00:00Z', endedAt: '2026-11-10T02:00:00Z' };

const c = (id: string, over: Partial<RPCaseInput> = {}): RPCaseInput => ({ id, groupId: 'g', status: 'in_progress', menteeName: id, inactive: false, activeMentorId: 'm1', ...over });
const log = (caseId: string, roundNo: number, when: { startedAt: string; endedAt: string }, reportAt: string | null = null, mentorId = 'm1'): RPLogInput => ({ caseId, roundNo, ...when, reportAt, mentorId });

describe('classifyCase', () => {
  it('검수 승인 이후 = 종료, 중도 종료·비활성화 = 진행 회차 유무로 포기 구분', () => {
    expect(classifyCase({ status: 'closed', inactive: true }, 4)).toBe('ended');
    expect(classifyCase({ status: 'settlement_pending', inactive: false }, 4)).toBe('ended');
    expect(classifyCase({ status: 'withdrawn', inactive: false }, 2)).toBe('gaveUpAfter');
    expect(classifyCase({ status: 'in_progress', inactive: true }, 1)).toBe('gaveUpAfter');
    expect(classifyCase({ status: 'registered', inactive: true }, 0)).toBe('gaveUpBefore');
    expect(classifyCase({ status: 'withdrawn', inactive: false }, 0)).toBe('gaveUpBefore');
    expect(classifyCase({ status: 'mentor_assigned', inactive: false }, 0)).toBe('ongoing');
  });
  it('운영사 지정 구분이 추정보다 우선', () => {
    expect(classifyCase({ status: 'in_progress', inactive: true, outcome: 'ended' }, 3)).toBe('ended');
    expect(classifyCase({ status: 'in_progress', inactive: false, outcome: 'gave_up' }, 2)).toBe('gaveUpAfter');
    expect(classifyCase({ status: 'mentor_assigned', inactive: false, outcome: 'gave_up' }, 0)).toBe('gaveUpBefore');
    expect(classifyCase({ status: 'closed', inactive: false, outcome: 'gave_up' }, 4)).toBe('gaveUpAfter');
    expect(classifyCase({ status: 'withdrawn', inactive: false, outcome: null }, 1)).toBe('gaveUpAfter');
  });
});

describe('computeRoundProgress', () => {
  const groups = [{ id: 'g', name: 'A그룹', requiredRounds: 3 }];
  const cases = [
    c('a'), // 1회차 완료+보고서, 2회차 예정
    c('b'), // 1회차 완료(보고서 없음)
    c('c', { activeMentorId: null, status: 'registered' }), // 미배정
    c('d', { status: 'withdrawn', activeMentorId: null, finalMentorIds: ['m2'] }), // 1회차 진행 후 포기
    c('e', { inactive: true, activeMentorId: 'm3' }), // 진행 안 하고 포기 (예정만 있음)
    c('f', { status: 'closed', activeMentorId: null, finalMentorIds: ['m1'] }), // 3회차 모두 진행 후 종료
  ];
  const logs = [
    log('a', 1, past(1), '2026-10-01T03:00:00Z'),
    log('a', 2, future),
    log('b', 1, past(2)),
    log('d', 1, past(3), '2026-10-03T03:00:00Z', 'm2'),
    log('e', 1, future, null, 'm3'),
    log('f', 1, past(4), 'x'),
    log('f', 2, past(5), 'x'),
    log('f', 3, past(6), 'x'),
  ];
  const r = computeRoundProgress({ groups, cases, logs, now });
  const g = r.groups[0]!;

  it('분류 합계', () => {
    expect(r.summary).toMatchObject({ total: 6, ongoing: 3, ongoingUnassigned: 1, ended: 1, gaveUpAfter: 1, gaveUpBefore: 1, participatingMentees: 5 });
    // m3 는 진행 안 하고 포기한 멘티만 맡았으므로 제외
    expect(r.summary.participatingMentors).toBe(2);
    expect(r.summary.currentMentors).toBe(1);
  });

  it('1회차 — 등록 + 미등록 + 제외 = 전체, 완료 + 미완료 + 제외 = 전체', () => {
    const r1 = g.rounds[0]!;
    expect(r1).toMatchObject({ registered: 5, unregistered: 1, excludedRegistration: 0, completed: 4, notCompleted: 1, notCompletedScheduled: 0, excludedCompletion: 1, reports: 3, reportPending: 1 });
    expect(r1.registered + r1.unregistered! + r1.excludedRegistration).toBe(6);
    expect(r1.completed + r1.notCompleted! + r1.excludedCompletion).toBe(6);
  });

  it('2회차 — 포기·종료 멘티 중 일정 없는 수는 미등록에서 제외', () => {
    const r2 = g.rounds[1]!;
    // 등록: a(예정)·f / 미등록: b·c / 제외: d·e
    expect(r2).toMatchObject({ registered: 2, unregistered: 2, excludedRegistration: 2, completed: 1, notCompleted: 3, notCompletedScheduled: 1, excludedCompletion: 2 });
  });

  it('그룹 회차 수를 넘는 추가 회차는 미등록·미완료를 세지 않는다', () => {
    const r2 = computeRoundProgress({ groups, cases: [c('x')], logs: [log('x', 4, past(7))], now });
    const extra = r2.groups[0]!.rounds[3]!;
    expect(extra).toMatchObject({ roundNo: 4, extra: true, registered: 1, unregistered: null, notCompleted: null, completed: 1 });
  });
});
