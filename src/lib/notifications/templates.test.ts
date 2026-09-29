import { describe, expect, it } from 'vitest';

import {
  AUTO_SEND_STAGES,
  AUTO_SEND_TOGGLE_KEYS,
  DIRECT_AUTO_SEND_DEFS,
  NOTIFICATION_EVENT_DEFS,
  NOTIFICATION_TEMPLATES,
  autoSendEnabled,
  buildMatchedMentorLoginGuideText,
  buildSurveyAutoReminderText,
  diffAutoSendSettings,
  normalizeAutoSendSettings,
} from '@/lib/notifications/templates';

describe('autoSendEnabled (키 없음 = 켬, false 만 끔)', () => {
  it('설정이 없거나 비객체면 켬', () => {
    expect(autoSendEnabled(null, 'survey_reminder_auto')).toBe(true);
    expect(autoSendEnabled(undefined, 'retention_notice')).toBe(true);
    expect(autoSendEnabled([], 'retention_notice')).toBe(true);
    expect(autoSendEnabled('x', 'retention_notice')).toBe(true);
  });
  it('정확히 false 만 끔', () => {
    expect(autoSendEnabled({ auto_login_guide_on_matched: false }, 'auto_login_guide_on_matched')).toBe(false);
    expect(autoSendEnabled({ auto_login_guide_on_matched: 'false' }, 'auto_login_guide_on_matched')).toBe(true);
    expect(autoSendEnabled({ auto_login_guide_on_matched: 0 }, 'auto_login_guide_on_matched')).toBe(true);
    expect(autoSendEnabled({ other: false }, 'auto_login_guide_on_matched')).toBe(true);
  });
});

describe('자동발송 카탈로그 정합성', () => {
  it('알림 이벤트 정의 = 템플릿 전부, 단계는 정의된 값', () => {
    expect(NOTIFICATION_EVENT_DEFS.map((d) => d.key).sort()).toEqual(Object.keys(NOTIFICATION_TEMPLATES).sort());
    const stages = new Set<string>(AUTO_SEND_STAGES.map((s) => s.key));
    for (const d of [...NOTIFICATION_EVENT_DEFS, ...DIRECT_AUTO_SEND_DEFS]) expect(stages.has(d.stage)).toBe(true);
  });
  it('토글 키는 중복이 없다', () => {
    expect(new Set(AUTO_SEND_TOGGLE_KEYS).size).toBe(AUTO_SEND_TOGGLE_KEYS.length);
  });
});

describe('normalizeAutoSendSettings', () => {
  it('false 만 저장, true 는 키를 남기지 않는다 (직발송 키 포함)', () => {
    const r = normalizeAutoSendSettings({ mentor_assigned: true, round_signed: false, survey_reminder_auto: false, retention_notice: true });
    expect(r).toEqual({ ok: true, next: { round_signed: false, survey_reminder_auto: false } });
  });
  it('알 수 없는 키·불리언 아닌 값은 거부', () => {
    expect(normalizeAutoSendSettings({ nope: false }).ok).toBe(false);
    expect(normalizeAutoSendSettings({ mentor_assigned: 'false' }).ok).toBe(false);
    expect(normalizeAutoSendSettings(null).ok).toBe(false);
    expect(normalizeAutoSendSettings([]).ok).toBe(false);
  });
});

describe('diffAutoSendSettings', () => {
  it('켬↔끔으로 바뀐 키만', () => {
    const d = diffAutoSendSettings({ round_signed: false, survey_reminder_auto: false }, { survey_reminder_auto: false, retention_notice: false });
    expect(d).toEqual(expect.arrayContaining([{ key: 'round_signed', on: true }, { key: 'retention_notice', on: false }]));
    expect(d).toHaveLength(2);
  });
  it('변경 없으면 빈 배열', () => {
    expect(diffAutoSendSettings({}, {})).toEqual([]);
    expect(diffAutoSendSettings(null, {})).toEqual([]);
  });
});

describe('직발송 문구', () => {
  it('매칭 멘토 로그인 안내 — 주소 없으면 줄 생략, 임시 비밀번호 안내·꼬리말', () => {
    const t = buildMatchedMentorLoginGuideText({ programName: 'P', mentorName: '홍길동', email: null, appUrl: '', mustChangePassword: true, footer: '끝' });
    const lines = t.split('\n');
    expect(lines[0]).toBe('[P] 홍길동 멘토님, 담당 멘티 배정이 확정되었습니다.');
    expect(lines).toContain('아이디: 이메일(-) 또는 휴대폰 번호');
    expect(lines.some((l) => l.endsWith('/login'))).toBe(false);
    expect(lines[lines.length - 1]).toBe('끝');
  });
  it('만족도 자동 독려', () => {
    expect(buildSurveyAutoReminderText({ programName: 'P', menteeName: '김', appUrl: 'https://x', footer: null })).toBe(
      '[P] 김님, 멘토링 만족도 조사가 아직 완료되지 않았습니다. 참여 부탁드립니다.\nhttps://x/mentee/survey (로그인 후 응답)',
    );
  });
});
