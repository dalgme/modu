import { describe, expect, it } from 'vitest';

import { BULK_SMS_FIELDS } from './bulk-sms-fields';
import { LOGIN_GUIDE_FIELDS, TEMP_PASSWORD_LINE } from './login-guide-template';
import { MENTOR_REMINDER_FIELDS } from './mentor-reminder-template';
import { bulkSmsFieldExamples, loginGuideFieldExamples, mentorReminderFieldExamples, type SmsFieldExample } from './field-examples';

/** 치환되지 않고 남은 자리표시자 */
const LEFTOVER = /\{[^{}\n]{1,30}\}/;

function checkAll(key: string, list: SmsFieldExample[]) {
  expect(list.length, key).toBeGreaterThanOrEqual(3);
  expect(list.length, key).toBeLessThanOrEqual(4);
  // ① 첫 예시는 필드 단독
  expect(list[0]!.input).toBe(`{${key}}`);
  for (const ex of list) {
    expect(ex.input, `${key}: ${ex.title}`).toContain(`{${key}}`);
    expect(ex.output, `${key}: ${ex.title}`).not.toMatch(LEFTOVER);
    expect(ex.output.trim(), `${key}: ${ex.title}`).not.toBe('');
    expect(ex.title.trim()).not.toBe('');
    expect(ex.who.trim()).not.toBe('');
  }
}

describe('문자 자동 기입 필드 사용 예시', () => {
  it('일반 문자 필드 14개 전부 3~4개 예시, 결과에 남은 {…} 없음', () => {
    expect(BULK_SMS_FIELDS).toHaveLength(14);
    for (const f of BULK_SMS_FIELDS) checkAll(f.key, bulkSmsFieldExamples(f.key));
  });

  it('로그인 안내 필드(임시 비밀번호 포함) 전부', () => {
    for (const f of LOGIN_GUIDE_FIELDS) checkAll(f.key, loginGuideFieldExamples(f.key));
  });

  it('멘토 리마인더 필드 4개 전부', () => {
    expect(MENTOR_REMINDER_FIELDS).toHaveLength(4);
    for (const f of MENTOR_REMINDER_FIELDS) checkAll(f.key, mentorReminderFieldExamples(f.key));
  });

  it('결과는 실제 렌더 규칙을 따른다 — 줄 생략·"-"·역할별', () => {
    const name = bulkSmsFieldExamples('name');
    expect(name[1]!.output).toBe('홍길동님, 안녕하세요. 이번 주 멘토링 일정을 확인해 주세요.');
    expect(name[3]!.output).toContain('김철수님');

    // 소속 없는 사람 → 소속 줄 생략
    const org = bulkSmsFieldExamples('organization')[3]!;
    expect(org.output).toBe('김철수님, 안녕하세요.\n이번 주 일정 확인 부탁드립니다.');

    // 멘토만 필드를 멘티가 받으면 줄 생략 / 이름과 같은 줄이면 '-'
    expect(bulkSmsFieldExamples('mentees')[3]!.output).not.toContain('담당 멘티');
    expect(bulkSmsFieldExamples('mentee_phones')[3]!.output).toBe('김철수님, 멘티 연락처: -');
    expect(bulkSmsFieldExamples('mentor')[0]!.output).toBe('홍길동');

    // 하단 문구 없음 → 줄 생략
    expect(bulkSmsFieldExamples('footer')[3]!.output).toBe('이번 주 금요일까지 서류를 제출해 주세요.');

    // 임시 비밀번호 안내 — 바꾼 사람에게는 줄 생략
    const tp = loginGuideFieldExamples('temp_password');
    expect(tp[0]!.output).toBe(TEMP_PASSWORD_LINE);
    expect(tp[3]!.output).toBe('아이디: hong@example.com');

    expect(mentorReminderFieldExamples('companies')[0]!.output).toBe('김철수, 이영희');
  });

  it('예시에 실제 행사명 대신 가짜 값만 쓴다', () => {
    const all = [
      ...BULK_SMS_FIELDS.flatMap((f) => bulkSmsFieldExamples(f.key)),
      ...MENTOR_REMINDER_FIELDS.flatMap((f) => mentorReminderFieldExamples(f.key)),
    ];
    for (const ex of all) if (ex.output.includes('멘토링') && ex.input.includes('{program}')) expect(ex.output).toContain('○○ 창업 멘토링');
  });
});
