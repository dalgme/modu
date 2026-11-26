import { describe, expect, it } from 'vitest';

import { caseExtensionOf, EXTENSION_REOPEN_STATUSES, extensionHoursError, extensionSelectBlock, extensionUsed, groupExtensionOf, hoursText, mentorChangedSinceSelection, minutesOf } from './extension-rule';
import { mentorHistoryStatus } from '@/lib/data/mentor-history-shared';

const group = groupExtensionOf({ extension_label: '1기 3라운드', extension_extra_hours: 3, extension_total_hours: 15 });

describe('라운드 연장 선정 (1기 3라운드)', () => {
  it('선정된 케이스만 회차 칸·시간 상한이 생긴다', () => {
    expect(caseExtensionOf(group, null)).toMatchObject({ available: true, active: false, extraRounds: 0, capMinutes: null });
    expect(caseExtensionOf(group, '2026-11-25T00:00:00Z')).toMatchObject({ active: true, label: '1기 3라운드', extraRounds: 3, capMinutes: 900 });
    expect(caseExtensionOf(groupExtensionOf({ extension_label: ' ' }), '2026-11-25T00:00:00Z')).toMatchObject({ available: false, active: false });
  });

  it('총 15시간을 넘는 회차는 막는다(미선정은 상한 없음)', () => {
    const on = caseExtensionOf(group, 'x');
    expect(extensionHoursError(on, 12 * 60, 3 * 60)).toBeNull();
    expect(extensionHoursError(on, 13 * 60, 3 * 60)).toContain('남은 시간 2시간');
    expect(extensionHoursError(caseExtensionOf(group, null), 40 * 60, 3 * 60)).toBeNull();
  });

  it('연장분을 쓰기 시작하면 해제할 수 없다', () => {
    expect(extensionUsed({ roundCount: 4, baseRounds: 4, totalMinutes: 12 * 60, group })).toBe(false);
    expect(extensionUsed({ roundCount: 5, baseRounds: 4, totalMinutes: 13 * 60, group })).toBe(true);
    expect(extensionUsed({ roundCount: 4, baseRounds: 4, totalMinutes: 13 * 60, group })).toBe(true);
  });

  it('검수 이후 단계는 다시 열고, 중도 종료는 선정 불가', () => {
    expect(EXTENSION_REOPEN_STATUSES).toEqual(['closure_requested', 'settlement_pending', 'settlement_batched', 'closed']);
    expect(extensionSelectBlock('withdrawn')).toBeTruthy();
    expect(extensionSelectBlock('closed')).toBeNull();
  });

  it('시간 표기', () => {
    expect(minutesOf('2026-11-25T01:00:00Z', '2026-11-25T04:00:00Z')).toBe(180);
    expect(hoursText(180)).toBe('3시간');
    expect(hoursText(90)).toBe('1.5시간');
  });
});

describe('멘토 끝난 멘토링 내역 상태', () => {
  it('가장 덜 진행된 정산 단계를 대표로', () => {
    expect(mentorHistoryStatus([])).toBe('none');
    expect(mentorHistoryStatus(['paid', 'paid'])).toBe('paid');
    expect(mentorHistoryStatus(['paid', 'confirmed'])).toBe('confirmed');
    expect(mentorHistoryStatus(['paid', 'batched'])).toBe('batched');
    expect(mentorHistoryStatus(['batched', 'pending'])).toBe('pending');
  });
});

describe('연장 선정 뒤 멘토 변경 판정', () => {
  const sel = '2026-11-25T03:00:00Z';
  it('선정 전 배정만 있으면 변경 아님(선정 때 되살린 종결 배정 포함)', () => {
    expect(mentorChangedSinceSelection([{ assigned_at: '2026-09-01T00:00:00Z', ended_at: null, is_active: true }], sel)).toBe(false);
  });
  it('선정 뒤 새 배정이 생기거나 기존 배정이 끝나면 변경', () => {
    expect(mentorChangedSinceSelection([
      { assigned_at: '2026-09-01T00:00:00Z', ended_at: '2026-11-26T01:00:00+00:00', is_active: false },
      { assigned_at: '2026-11-26T01:00:00+00:00', ended_at: null, is_active: true },
    ], sel)).toBe(true);
    expect(mentorChangedSinceSelection([{ assigned_at: '2026-09-01T00:00:00Z', ended_at: '2026-11-26T01:00:00Z', is_active: false }], sel)).toBe(true);
    expect(mentorChangedSinceSelection([{ assigned_at: '2026-11-26T01:00:00Z', ended_at: null, is_active: true }], null)).toBe(false);
  });
});
