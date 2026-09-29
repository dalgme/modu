import { describe, expect, it } from 'vitest';

import {
  BULK_SMS_FIELDS,
  bulkFieldsUsed,
  buttonLabel,
  fallbackBulkRecipient,
  renderBulkSms,
  usesBulkFields,
  validateBulkSmsText,
} from './bulk-sms-fields';
import type { LoginGuideContext, LoginGuideRecipient } from './login-guide-template';

const ctx: LoginGuideContext = { programName: '○○ 창업 멘토링', loginUrl: 'https://example.com/login', footer: null };

const mentee: LoginGuideRecipient = {
  id: 'u2',
  name: '김철수',
  role: 'mentee',
  email: 'kim@example.com',
  phone: '01011112222',
  mustChangePassword: true,
  organization: null,
  groupNames: ['A그룹'],
  mentees: [],
  mentors: [{ name: '홍길동', phone: '010-1234-5678' }],
  skip: null,
};

describe('일반 문자 자동 기입 필드', () => {
  it('임시 비밀번호 안내는 목록에 없고, 버튼 표기는 "이름 : {키}"', () => {
    expect(BULK_SMS_FIELDS.some((f) => (f.key as string) === 'temp_password')).toBe(false);
    const name = BULK_SMS_FIELDS.find((f) => f.key === 'name')!;
    expect(buttonLabel(name)).toBe('수신자 이름 : {name}');
    expect(BULK_SMS_FIELDS.find((f) => f.key === 'mentees')!.target).toBe('멘토만');
    expect(BULK_SMS_FIELDS.find((f) => f.key === 'mentor')!.target).toBe('멘티만');
    expect(name.target).toBe('공통');
  });

  it('이름·행사명 치환', () => {
    expect(renderBulkSms('[{program}] {name}님 안녕하세요', mentee, ctx)).toBe('[○○ 창업 멘토링] 김철수님 안녕하세요');
  });

  it('멘토 전용 필드를 멘티가 받으면 그 줄만 빠지고, 다른 필드와 섞인 줄은 "-"', () => {
    const text = '{name}님\n담당 멘티: {mentees}\n{name}님 담당 멘티 {mentees}';
    expect(renderBulkSms(text, mentee, ctx)).toBe('김철수님\n김철수님 담당 멘티 -');
  });

  it('알 수 없는 필드는 거부', () => {
    const err = validateBulkSmsText('{name}님 {이름} {foo}');
    expect(err).toContain('{이름}');
    expect(err).toContain('{foo}');
    expect(validateBulkSmsText('{name}님 {mentor_phone}')).toBeNull();
    expect(validateBulkSmsText('필드 없는 문자')).toBeNull();
  });

  it('임시 비밀번호 안내 필드는 거부', () => {
    expect(validateBulkSmsText('{name}님\n{temp_password}')).toContain('{temp_password}');
  });

  it('필드 사용 여부·목록', () => {
    expect(usesBulkFields('안녕하세요')).toBe(false);
    expect(usesBulkFields('{name}님')).toBe(true);
    expect(usesBulkFields('{foo}')).toBe(false);
    expect(bulkFieldsUsed('{name} {program} {name}')).toEqual(['name', 'program']);
  });

  it('치환 데이터가 없는 수신자도 이름·행사명은 들어간다', () => {
    const r = fallbackBulkRecipient({ id: 'x', name: '이영희', role: 'mentor' });
    expect(renderBulkSms('[{program}] {name}님\n담당 멘티: {mentees}', r, ctx)).toBe('[○○ 창업 멘토링] 이영희님');
  });
});
