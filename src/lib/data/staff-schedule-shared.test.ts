import { describe, expect, it } from 'vitest';

import {
  buildMentorDetail,
  countByStatus,
  groupByDay,
  includeRound,
  matchesRoundSearch,
  monthGrid,
  parseMonthParam,
  parseYmdParam,
  roundStatus,
  roundsOnDay,
  shiftMonth,
  shiftYmd,
  sortMentors,
  summaryText,
  timeRange,
  type StaffRound,
  type StaffScheduleCase,
} from '@/lib/data/staff-schedule-shared';

// 2026-09-29 12:00 KST
const NOW = Date.parse('2026-09-29T03:00:00Z');

function round(p: Partial<StaffRound> & { id: string; caseId: string; roundNo: number; startedAt: string }): StaffRound {
  const reported = p.reported ?? false;
  return {
    requiredTotal: 4,
    menteeLabel: '멘티',
    menteePhone: null,
    mentorId: 'm1',
    mentorName: '김멘토',
    mentorPhone: null,
    mode: 'online',
    endedAt: p.startedAt,
    place: null,
    caseStatus: 'in_progress',
    groupName: 'A',
    status: roundStatus({ reported, startedAt: p.startedAt }, NOW),
    ...p,
    reported,
  };
}

describe('roundStatus', () => {
  it('보고서 등록 = 완료 (시각과 무관)', () => {
    expect(roundStatus({ reported: true, startedAt: '2026-12-01T01:00:00Z' }, NOW)).toBe('done');
  });
  it('미보고 + 미래 = 예약', () => {
    expect(roundStatus({ reported: false, startedAt: '2026-09-29T04:00:00Z' }, NOW)).toBe('planned');
  });
  it('미보고 + 지난 시각 = 보고서 대기', () => {
    expect(roundStatus({ reported: false, startedAt: '2026-09-29T02:00:00Z' }, NOW)).toBe('pending');
  });
});

describe('includeRound', () => {
  it('중도 종료 케이스는 이행 회차만', () => {
    expect(includeRound('withdrawn', true)).toBe(true);
    expect(includeRound('withdrawn', false)).toBe(false);
    expect(includeRound('in_progress', false)).toBe(true);
  });
});

describe('날짜 헬퍼 (KST)', () => {
  it('?date 검증 — 잘못된 값은 오늘(KST)', () => {
    expect(parseYmdParam('2026-02-30', NOW)).toBe('2026-09-29');
    expect(parseYmdParam('2026-10-01', NOW)).toBe('2026-10-01');
    // UTC 로는 전날(9/28 15:30Z) 이지만 KST 로는 9/29
    expect(parseYmdParam(undefined, Date.parse('2026-09-28T15:30:00Z'))).toBe('2026-09-29');
  });
  it('?month 검증', () => {
    expect(parseMonthParam('2026-13', undefined, NOW)).toBe('2026-09');
    expect(parseMonthParam(null, '2026-11-03', NOW)).toBe('2026-11');
    expect(parseMonthParam('2027-01', undefined, NOW)).toBe('2027-01');
  });
  it('날짜·월 이동 (연 경계)', () => {
    expect(shiftYmd('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftYmd('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('월 격자 42칸, 일요일 시작', () => {
    const g = monthGrid('2026-09'); // 2026-09-01 = 화요일
    expect(g).toHaveLength(42);
    expect(g[0]).toMatchObject({ ymd: '2026-08-30', weekday: 0, inMonth: false });
    expect(g[2]).toMatchObject({ ymd: '2026-09-01', inMonth: true });
  });
  it('시간 범위는 KST', () => {
    expect(timeRange('2026-09-29T01:00:00Z', '2026-09-29T02:30:00Z')).toBe('10:00~11:30');
  });
});

describe('분류·집계', () => {
  const rows = [
    round({ id: 'a', caseId: 'c1', roundNo: 1, startedAt: '2026-09-28T16:00:00Z', reported: true }), // 9/29 01:00 KST
    round({ id: 'b', caseId: 'c2', roundNo: 2, startedAt: '2026-09-29T05:00:00Z' }), // 9/29 14:00 KST, 예약
    round({ id: 'c', caseId: 'c3', roundNo: 1, startedAt: '2026-09-28T14:00:00Z' }), // 9/28 23:00 KST, 대기
  ];
  it('KST 날짜로 묶는다 (UTC 날짜가 달라도)', () => {
    const g = groupByDay(rows);
    expect(Object.keys(g).sort()).toEqual(['2026-09-28', '2026-09-29']);
    expect(g['2026-09-29']!.map((r) => r.id)).toEqual(['a', 'b']);
    expect(roundsOnDay(rows, '2026-09-28').map((r) => r.id)).toEqual(['c']);
  });
  it('상태별 건수', () => {
    expect(countByStatus(rows)).toEqual({ planned: 1, pending: 1, done: 1 });
  });
  it('검색 — 이름·휴대폰 숫자', () => {
    const r = { menteeLabel: '홍길동/길동상회', mentorName: '김멘토', menteePhone: '010-1234-5678', mentorPhone: '01099998888' };
    expect(matchesRoundSearch(r, '길동')).toBe(true);
    expect(matchesRoundSearch(r, '김멘')).toBe(true);
    expect(matchesRoundSearch(r, '1234-56')).toBe(true);
    expect(matchesRoundSearch(r, '9999')).toBe(true);
    expect(matchesRoundSearch(r, '이순신')).toBe(false);
    expect(matchesRoundSearch(r, '  ')).toBe(true);
  });
  it('멘토 가나다순', () => {
    expect(sortMentors([{ name: '하' }, { name: '가' }, { name: '나' }]).map((m) => m.name)).toEqual(['가', '나', '하']);
  });
});

describe('buildMentorDetail', () => {
  const cases: StaffScheduleCase[] = [
    { id: 'c1', menteeLabel: '나멘티', menteePhone: null, status: 'in_progress', groupName: 'A', requiredTotal: 4, activeMentorId: 'm1', mentorIds: ['m0', 'm1'] },
    { id: 'c2', menteeLabel: '가멘티', menteePhone: null, status: 'withdrawn', groupName: 'A', requiredTotal: 4, activeMentorId: null, mentorIds: ['m1'] },
    { id: 'c3', menteeLabel: '다멘티', menteePhone: null, status: 'in_progress', groupName: 'A', requiredTotal: 4, activeMentorId: 'm9', mentorIds: ['m9'] },
  ];
  const rounds = [
    // c1: 1회차는 교체 전 멘토 m0, 2회차 완료, 3회차 예약 — 4회차 미등록
    round({ id: 'r1', caseId: 'c1', roundNo: 1, startedAt: '2026-09-01T01:00:00Z', reported: true, mentorId: 'm0' }),
    round({ id: 'r2', caseId: 'c1', roundNo: 2, startedAt: '2026-09-10T01:00:00Z', reported: true }),
    round({ id: 'r3', caseId: 'c1', roundNo: 3, startedAt: '2026-10-10T01:00:00Z' }),
    // c2: 중도 종료 — 이 멘토가 완료한 1회차만 남아 있음
    round({ id: 'r4', caseId: 'c2', roundNo: 1, startedAt: '2026-09-02T01:00:00Z', reported: true, caseStatus: 'withdrawn' }),
    // c3: 다른 멘토
    round({ id: 'r5', caseId: 'c3', roundNo: 1, startedAt: '2026-09-02T01:00:00Z', mentorId: 'm9' }),
  ];
  const { summary, mentees } = buildMentorDetail('m1', cases, rounds);

  it('요약 = 현재 담당 케이스 기준 (케이스 단위 누적 회차)', () => {
    expect(summary).toEqual({ plan: 4, scheduled: 1, pending: 0, done: 2, unregistered: 1, previousDone: 1 });
    expect(summaryText(summary)).toBe('계획 4건, 예정 1건, 완료 2건, 미등록 1건');
  });
  it('현재 담당 멘티 먼저, 목표 회차까지 미등록 행으로 채움', () => {
    expect(mentees.map((m) => m.caseId)).toEqual(['c1', 'c2']);
    const c1 = mentees[0]!;
    expect(c1.rows.map((r) => `${r.roundNo}:${r.kind}`)).toEqual(['1:round', '2:round', '3:round', '4:unregistered']);
    expect(c1.rows[0]!.byOtherMentor).toBe(true);
    expect(mentees[1]).toMatchObject({ current: false });
    expect(mentees[1]!.rows).toHaveLength(1);
  });
});
