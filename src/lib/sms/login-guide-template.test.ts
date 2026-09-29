import { describe, expect, it } from 'vitest';

import {
  TEMP_PASSWORD_LINE,
  defaultLoginGuideTemplate,
  legacyHeadTemplate,
  renderLoginGuide,
  smsByteLength,
  smsKind,
  unknownPlaceholders,
  validateLoginGuideTemplate,
  type LoginGuideContext,
  type LoginGuideRecipient,
} from './login-guide-template';

const ctx: LoginGuideContext = { programName: '테스트 행사', loginUrl: 'https://example.com/login', footer: '하단 안내' };

const mentor: LoginGuideRecipient = {
  id: 'u1',
  name: '홍길동',
  role: 'mentor',
  email: 'hong@example.com',
  phone: '01012345678',
  mustChangePassword: true,
  organization: '컨설팅사',
  groupNames: ['A그룹'],
  mentees: [
    { name: '김철수', phone: '010-1111-2222' },
    { name: '이영희', phone: null },
  ],
  mentors: [],
  skip: null,
};

const mentee: LoginGuideRecipient = {
  id: 'u2',
  name: '김철수',
  role: 'mentee',
  email: null,
  phone: '010-1111-2222',
  mustChangePassword: false,
  organization: null,
  groupNames: [],
  mentees: [],
  mentors: [],
  skip: null,
};

describe('renderLoginGuide', () => {
  it('자동화 필드를 치환한다', () => {
    const text = renderLoginGuide('{name}({role}) {program} {login_url} {login_id} {phone} {organization} {group}', mentor, ctx);
    expect(text).toBe('홍길동(멘토) 테스트 행사 https://example.com/login hong@example.com 010-1234-5678 컨설팅사 A그룹');
  });

  it('멘토의 매칭 멘티 이름·휴대폰을 쉼표로 잇는다', () => {
    expect(renderLoginGuide('{mentees}', mentor, ctx)).toBe('김철수, 이영희');
    expect(renderLoginGuide('{mentee_phones}', mentor, ctx)).toBe('010-1111-2222, -');
    expect(renderLoginGuide('{mentee_contacts}', mentor, ctx)).toBe('김철수 010-1111-2222, 이영희');
  });

  it('멘티의 담당 멘토를 표시한다', () => {
    const r = { ...mentee, mentors: [{ name: '박멘토', phone: '01055556666' }] };
    expect(renderLoginGuide('담당 멘토: {mentor} ({mentor_phone})', r, ctx)).toBe('담당 멘토: 박멘토 (010-5555-6666)');
  });

  it('빈 값은 "-", 빈 선택 필드만 있는 줄은 생략한다', () => {
    const text = renderLoginGuide('아이디: {login_id}\n담당 멘토: {mentor}\n그룹 {group} · {name}', mentee, ctx);
    expect(text).toBe('아이디: -\n그룹 - · 김철수');
  });

  it('임시 비밀번호 안내는 비밀번호 미변경 회원에게만 들어간다', () => {
    const tpl = '안내\n{temp_password}\n끝';
    expect(renderLoginGuide(tpl, mentor, ctx)).toBe(`안내\n${TEMP_PASSWORD_LINE}\n끝`);
    expect(renderLoginGuide(tpl, mentee, ctx)).toBe('안내\n끝');
    // 다른 값과 같은 줄이면 '-' 가 아니라 빈칸
    expect(renderLoginGuide('{name} {temp_password}', mentee, ctx)).toBe('김철수');
  });

  it('하단 문구가 없으면 줄째 빠진다', () => {
    const text = renderLoginGuide('본문\n{footer}', mentor, { ...ctx, footer: null });
    expect(text).toBe('본문');
  });

  it('기본 템플릿이 이전 기본 문구 구성을 유지한다', () => {
    const text = renderLoginGuide(defaultLoginGuideTemplate('mentor'), mentor, ctx);
    expect(text).toBe(
      [
        "[테스트 행사] 홍길동님, '테스트 행사' 멘토링 플랫폼에 멘토로 등록되었습니다.",
        '담당 멘티: 김철수, 이영희',
        'https://example.com/login',
        '아이디: 이메일(hong@example.com) 또는 휴대폰 번호',
        TEMP_PASSWORD_LINE,
        '하단 안내',
      ].join('\n'),
    );
    // 배정 전 멘티: 담당 멘토 줄·임시 비밀번호 줄 생략
    const menteeText = renderLoginGuide(defaultLoginGuideTemplate('mentee'), mentee, ctx);
    expect(menteeText).not.toContain('담당 멘토');
    expect(menteeText).not.toContain('임시 비밀번호');
    expect(menteeText).toContain('아이디: 이메일(-) 또는 휴대폰 번호');
  });

  it('구 {name} 첫 줄 문구를 호환한다', () => {
    const text = renderLoginGuide(legacyHeadTemplate('{name}님 안녕하세요'), mentee, ctx);
    expect(text.split('\n')[0]).toBe('김철수님 안녕하세요');
    expect(text).toContain('https://example.com/login');
  });
});

describe('validateLoginGuideTemplate', () => {
  it('알 수 없는 필드를 거부한다', () => {
    expect(unknownPlaceholders('{name} {이름} {foo}')).toEqual(['{이름}', '{foo}']);
    expect(validateLoginGuideTemplate('{name} {foo}')).toContain('{foo}');
  });
  it('빈 내용·길이 초과를 거부한다', () => {
    expect(validateLoginGuideTemplate('   ')).not.toBeNull();
    expect(validateLoginGuideTemplate('가'.repeat(1001))).not.toBeNull();
    expect(validateLoginGuideTemplate(defaultLoginGuideTemplate('mentee'))).toBeNull();
  });
});

describe('smsByteLength', () => {
  it('한글 2바이트·ASCII 1바이트로 센다', () => {
    expect(smsByteLength('ab가')).toBe(4);
    expect(smsKind('가'.repeat(45))).toBe('SMS');
    expect(smsKind('가'.repeat(46))).toBe('LMS');
  });
});
