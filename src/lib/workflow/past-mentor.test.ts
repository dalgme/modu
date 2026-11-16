import { describe, expect, it } from 'vitest';

import { pastMentorLabel, pickPastMentor } from './past-mentor';

const a = (mentor_id: string, assigned_at: string, is_active: boolean, end_kind: string | null) => ({ mentor_id, assigned_at, is_active, end_kind });

describe('pickPastMentor', () => {
  it('활성 배정이 있으면 null (현재 담당 멘토가 따로 표시된다)', () => {
    expect(pickPastMentor([a('m1', '2026-09-01', true, null), a('m0', '2026-08-01', false, 'reassigned')], new Set())).toBeNull();
  });
  it('멘토 중도 종료 후 재배정 대기 — 마지막 멘토를 돌려준다', () => {
    expect(pickPastMentor([a('m0', '2026-08-01', false, 'reassigned'), a('m1', '2026-09-01', false, 'mentor_withdrawal')], new Set())).toEqual({ mentorId: 'm1', endKind: 'mentor_withdrawal', assignedAt: '2026-09-01' });
  });
  it('회차 없이 회수된 배정은 건너뛰고, 회차를 진행한 회수 멘토는 포함', () => {
    const rows = [a('m1', '2026-08-01', false, 'forced'), a('m2', '2026-09-01', false, 'recalled')];
    expect(pickPastMentor(rows, new Set())?.mentorId).toBe('m1');
    expect(pickPastMentor(rows, new Set(['m2']))?.mentorId).toBe('m2');
    expect(pickPastMentor([a('m2', '2026-09-01', false, 'recalled')], new Set())).toBeNull();
  });
  it('표기', () => {
    expect(pastMentorLabel('홍길동', 'mentor_withdrawal')).toBe('홍길동 (멘토 중도 종료)');
    expect(pastMentorLabel('홍길동', 'case_withdrawn')).toBe('홍길동 (멘티 중도 종료)');
  });
});
