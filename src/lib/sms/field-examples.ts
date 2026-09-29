/**
 * 문자 자동 기입 필드 "사용 예시" — 필드 안내 표의 [예시] 버튼 팝업이 보여 줄 입력/결과 대조 데이터.
 * 서버·클라이언트 공용 순수 모듈('server-only' / 'use client' 없음, §6-10).
 *
 * - `input` 은 사람이 손으로 쓴 예시 문구, `output` 은 **실제 발송과 같은 렌더 함수**로 계산한다
 *   (일반 문자 = `renderBulkSms`, 로그인 안내 = `renderLoginGuide`, 멘토 리마인더 = `renderMentorReminder`).
 *   그래서 줄 생략·'-' 표시 같은 규칙이 바뀌면 예시도 저절로 따라 바뀐다.
 * - 예시 값은 전부 가짜 값(홍길동·김철수·이영희·○○ 창업 멘토링 …) — 실제 행사명·회원 정보를 쓰지 않는다.
 * - 필드마다 3~4개: ① 필드 단독 ② 문장 속에서 ③ 다른 필드와 섞어서 ④ (의미가 있을 때) 값이 없거나 다른 역할이 받을 때
 */
import { renderBulkSms, type BulkSmsFieldKey } from '@/lib/sms/bulk-sms-fields';
import {
  renderLoginGuide,
  type LoginGuideContext,
  type LoginGuideFieldKey,
  type LoginGuideRecipient,
} from '@/lib/sms/login-guide-template';
import { renderMentorReminder, type MentorReminderFieldKey, type MentorReminderVars } from '@/lib/sms/mentor-reminder-template';

export interface SmsFieldExample {
  /** 예시 제목 — 예) "필드만 단독으로" */
  title: string;
  /** 받는 사람 설명 — 예) "멘토 홍길동이 받을 때" */
  who: string;
  /** 필드 사용 입력 예시 (문자 내용 칸에 쓰는 문구) */
  input: string;
  /** 발송되는 실제 문자 내용 예시 (렌더 함수 결과) */
  output: string;
  /** 쉬운 말 설명 (선택) */
  note?: string;
}

/** 예시용 가짜 행사 공통 값 */
export const EXAMPLE_CONTEXT: LoginGuideContext = {
  programName: '○○ 창업 멘토링',
  loginUrl: 'https://○○○.kr/login',
  footer: '(문의: ○○ 사무국)',
};

/** 예시용 가짜 멘토 — 담당 멘티 김철수·이영희 */
export const EXAMPLE_MENTOR: LoginGuideRecipient = {
  id: 'example-mentor',
  name: '홍길동',
  role: 'mentor',
  email: 'hong@example.com',
  phone: '010-1234-5678',
  mustChangePassword: true,
  organization: '○○컨설팅',
  groupNames: ['A그룹'],
  mentees: [
    { name: '김철수', phone: '010-1111-2222' },
    { name: '이영희', phone: '010-3333-4444' },
  ],
  mentors: [],
  skip: null,
};

/** 예시용 가짜 멘티 — 담당 멘토 홍길동 */
export const EXAMPLE_MENTEE: LoginGuideRecipient = {
  id: 'example-mentee',
  name: '김철수',
  role: 'mentee',
  email: 'kim@example.com',
  phone: '010-1111-2222',
  mustChangePassword: true,
  organization: '○○스타트업',
  groupNames: ['A그룹'],
  mentees: [],
  mentors: [{ name: '홍길동', phone: '010-1234-5678' }],
  skip: null,
};

const WHO_MENTOR = '멘토 홍길동이 받을 때';
const WHO_MENTEE = '멘티 김철수가 받을 때';

/** 예시 한 개를 만드는 재료 — output 은 렌더 함수로 채운다 */
interface Spec {
  title: string;
  input: string;
  /** 받는 사람 (기본 = 멘토 홍길동) */
  to?: LoginGuideRecipient;
  who?: string;
  /** 행사 공통 값 덮어쓰기 (예: 하단 문구 없음) */
  ctx?: Partial<LoginGuideContext>;
  note?: string;
}

const T_ALONE = '필드만 단독으로';
const T_SENTENCE = '문장 속에 넣어서';
const T_MIXED = '다른 필드와 섞어서';

/** 일반 문자·로그인 안내 공용 예시 재료 (임시 비밀번호 안내 제외 14개) */
const BULK_SPECS: Record<BulkSmsFieldKey, Spec[]> = {
  name: [
    { title: T_ALONE, input: '{name}' },
    { title: T_SENTENCE, input: '{name}님, 안녕하세요. 이번 주 멘토링 일정을 확인해 주세요.' },
    { title: T_MIXED, input: '[{program}] {name}님({role}), 로그인 주소: {login_url}' },
    {
      title: '받는 사람마다 자기 이름으로',
      input: '{name}님, 안녕하세요. 이번 주 멘토링 일정을 확인해 주세요.',
      to: EXAMPLE_MENTEE,
      note: '같은 문구를 여러 명에게 보내도 받는 사람마다 자기 이름이 들어갑니다.',
    },
  ],
  role: [
    { title: T_ALONE, input: '{role}' },
    { title: T_SENTENCE, input: '{name}님은 이번 사업에 {role}(으)로 참여하십니다.' },
    { title: T_MIXED, input: '[{program}] {role} {name}님, 이번 달 활동 보고서를 제출해 주세요.' },
    {
      title: '멘티가 받을 때',
      input: '{name}님은 이번 사업에 {role}(으)로 참여하십니다.',
      to: EXAMPLE_MENTEE,
      note: '받는 사람의 역할(멘토·멘티·운영사·발주처)이 그대로 들어갑니다.',
    },
  ],
  login_id: [
    { title: T_ALONE, input: '{login_id}' },
    { title: T_SENTENCE, input: '로그인 아이디는 {login_id} 입니다.' },
    { title: T_MIXED, input: '{name}님, 아래 주소에서 아이디({login_id})로 로그인해 주세요.\n{login_url}' },
    {
      title: '이메일이 등록되지 않은 사람이 받을 때',
      input: '로그인 아이디는 {login_id} 입니다.',
      to: { ...EXAMPLE_MENTOR, email: null },
      who: '이메일이 없는 멘토 홍길동이 받을 때',
      note: "등록된 이메일이 없으면 그 자리에 '-' 가 들어갑니다. 이 줄은 빠지지 않고 그대로 나갑니다.",
    },
  ],
  phone: [
    { title: T_ALONE, input: '{phone}' },
    { title: T_SENTENCE, input: '등록된 연락처({phone})가 맞는지 확인해 주세요.' },
    { title: T_MIXED, input: '[{program}] {name}님의 등록 연락처는 {phone} 입니다. 바뀌었으면 사무국에 알려 주세요.' },
  ],
  login_url: [
    { title: T_ALONE, input: '{login_url}' },
    { title: T_SENTENCE, input: '아래 주소로 접속해 로그인해 주세요.\n{login_url}' },
    { title: T_MIXED, input: '[{program}] {name}님, 멘토링 플랫폼 로그인 안내입니다.\n{login_url}\n아이디: {login_id}' },
  ],
  program: [
    { title: T_ALONE, input: '{program}' },
    { title: T_SENTENCE, input: '{program} 참여를 환영합니다.' },
    { title: T_MIXED, input: '[{program}] {name}님, {group} 중간 점검 설문에 응답해 주세요.' },
  ],
  organization: [
    { title: T_ALONE, input: '{organization}' },
    { title: T_SENTENCE, input: '{name}님(소속: {organization}), 안녕하세요.' },
    { title: T_MIXED, input: '[{program}] {organization} {name}님\n이번 주 일정 확인 부탁드립니다.' },
    {
      title: '소속이 없는 사람이 받을 때',
      input: '{name}님, 안녕하세요.\n소속: {organization}\n이번 주 일정 확인 부탁드립니다.',
      to: { ...EXAMPLE_MENTEE, organization: null },
      who: '소속이 없는 멘티 김철수가 받을 때',
      note: "소속이 등록되지 않은 사람에게는 '소속: …' 줄이 통째로 빠집니다. 이름처럼 항상 있는 정보와 같은 줄에 쓰면 줄은 남고 소속 자리에 '-' 가 들어갑니다.",
    },
  ],
  group: [
    { title: T_ALONE, input: '{group}' },
    { title: T_SENTENCE, input: '{group} 멘토링이 다음 주에 시작됩니다.' },
    { title: T_MIXED, input: '[{program}] {name}님, {group} 오리엔테이션 일정을 안내드립니다.' },
    {
      title: '그룹이 정해지지 않은 사람이 받을 때',
      input: '{name}님, 안녕하세요.\n참여 그룹: {group}\n오리엔테이션 일정은 따로 안내드립니다.',
      to: { ...EXAMPLE_MENTEE, groupNames: [] },
      who: '그룹이 없는 멘티 김철수가 받을 때',
      note: "그룹이 없는 사람에게는 '참여 그룹: …' 줄이 통째로 빠집니다.",
    },
  ],
  mentees: [
    { title: T_ALONE, input: '{mentees}' },
    { title: T_SENTENCE, input: '담당 멘티: {mentees}' },
    { title: T_MIXED, input: '[{program}] {name} 멘토님, 담당 멘티({mentees})의 이번 주 회차를 등록해 주세요.' },
    {
      title: '멘티가 받을 때 (멘토만 쓰는 칸)',
      input: '{name}님, 안녕하세요.\n담당 멘티: {mentees}\n이번 주도 잘 부탁드립니다.',
      to: EXAMPLE_MENTEE,
      who: WHO_MENTEE,
      note: "멘토에게만 채워지는 칸이라 멘티에게는 '담당 멘티: …' 줄이 통째로 빠집니다. 아직 배정된 멘티가 없는 멘토도 마찬가지입니다.",
    },
  ],
  mentee_phones: [
    { title: T_ALONE, input: '{mentee_phones}' },
    { title: T_SENTENCE, input: '담당 멘티 연락처: {mentee_phones}' },
    { title: T_MIXED, input: '{name} 멘토님, 담당 멘티 {mentees} 님께 첫 연락을 부탁드립니다.\n연락처: {mentee_phones}' },
    {
      title: '멘티가 받을 때 (이름과 같은 줄)',
      input: '{name}님, 멘티 연락처: {mentee_phones}',
      to: EXAMPLE_MENTEE,
      who: WHO_MENTEE,
      note: "멘토에게만 채워지는 칸입니다. 이름처럼 항상 있는 정보와 같은 줄에 있으면 줄은 남고 빈 자리에 '-' 가 들어갑니다.",
    },
  ],
  mentee_contacts: [
    { title: T_ALONE, input: '{mentee_contacts}' },
    { title: T_SENTENCE, input: '담당 멘티: {mentee_contacts}' },
    { title: T_MIXED, input: '[{program}] {name} 멘토님\n담당 멘티 연락처: {mentee_contacts}\n첫 만남 일정을 잡아 주세요.' },
    {
      title: '배정된 멘티가 없는 멘토가 받을 때',
      input: '[{program}] {name} 멘토님\n담당 멘티 연락처: {mentee_contacts}\n첫 만남 일정을 잡아 주세요.',
      to: { ...EXAMPLE_MENTOR, mentees: [] },
      who: '배정된 멘티가 없는 멘토 홍길동이 받을 때',
      note: "아직 멘티가 배정되지 않았으면 '담당 멘티 연락처: …' 줄이 통째로 빠집니다.",
    },
  ],
  mentor: [
    { title: T_ALONE, input: '{mentor}', to: EXAMPLE_MENTEE },
    { title: T_SENTENCE, input: '담당 멘토: {mentor}', to: EXAMPLE_MENTEE },
    { title: T_MIXED, input: '[{program}] {name}님, 담당 {mentor} 멘토님과의 첫 멘토링 일정을 확인해 주세요.', to: EXAMPLE_MENTEE },
    {
      title: '멘토가 받을 때 (멘티만 쓰는 칸)',
      input: '{name}님, 안녕하세요.\n담당 멘토: {mentor}\n이번 주 일정을 확인해 주세요.',
      to: EXAMPLE_MENTOR,
      who: WHO_MENTOR,
      note: "멘티에게만 채워지는 칸이라 멘토에게는 '담당 멘토: …' 줄이 통째로 빠집니다. 아직 멘토가 배정되지 않은 멘티도 마찬가지입니다.",
    },
  ],
  mentor_phone: [
    { title: T_ALONE, input: '{mentor_phone}', to: EXAMPLE_MENTEE },
    { title: T_SENTENCE, input: '담당 멘토 연락처: {mentor_phone}', to: EXAMPLE_MENTEE },
    { title: T_MIXED, input: '{name}님, 담당 멘토 {mentor}({mentor_phone})님께 먼저 인사 문자를 보내 주세요.', to: EXAMPLE_MENTEE },
    {
      title: '멘토가 아직 없는 멘티가 받을 때 (이름과 같은 줄)',
      input: '{name}님의 담당 멘토 연락처: {mentor_phone}',
      to: { ...EXAMPLE_MENTEE, mentors: [] },
      who: '멘토 배정 전인 멘티 김철수가 받을 때',
      note: "이름처럼 항상 있는 정보와 같은 줄에 있으면 줄은 남고 빈 자리에 '-' 가 들어갑니다. 연락처만 있는 줄이었다면 줄이 통째로 빠집니다.",
    },
  ],
  footer: [
    { title: T_ALONE, input: '{footer}' },
    { title: T_SENTENCE, input: '이번 주 금요일까지 서류를 제출해 주세요.\n{footer}' },
    { title: T_MIXED, input: '[{program}] {name}님, 만족도 설문에 응답 부탁드립니다.\n{footer}' },
    {
      title: '하단 문구를 등록하지 않았을 때',
      input: '이번 주 금요일까지 서류를 제출해 주세요.\n{footer}',
      ctx: { footer: null },
      who: '행사 설정에 하단 문구가 없을 때',
      note: '행사 설정에 하단 문구가 없으면 그 줄은 통째로 빠집니다.',
    },
  ],
};

/** 로그인 안내 문자 전용 — 임시 비밀번호 안내 */
const TEMP_PASSWORD_SPECS: Spec[] = [
  { title: T_ALONE, input: '{temp_password}' },
  { title: T_SENTENCE, input: '아이디: {login_id}\n{temp_password}' },
  { title: T_MIXED, input: '[{program}] {name}님, 멘토링 플랫폼에 등록되었습니다.\n{login_url}\n아이디: {login_id}\n{temp_password}' },
  {
    title: '이미 비밀번호를 바꾼 사람이 받을 때',
    input: '아이디: {login_id}\n{temp_password}',
    to: { ...EXAMPLE_MENTOR, mustChangePassword: false },
    who: '비밀번호를 이미 바꾼 멘토 홍길동이 받을 때',
    note: '첫 로그인 후 비밀번호를 바꾼 사람에게는 임시 비밀번호 안내 줄이 통째로 빠집니다.',
  },
];

function whoOf(spec: Spec): string {
  if (spec.who) return spec.who;
  return (spec.to ?? EXAMPLE_MENTOR).role === 'mentee' ? WHO_MENTEE : WHO_MENTOR;
}

function build(specs: Spec[], render: (text: string, r: LoginGuideRecipient, ctx: LoginGuideContext) => string): SmsFieldExample[] {
  return specs.map((s) => ({
    title: s.title,
    who: whoOf(s),
    input: s.input,
    output: render(s.input, s.to ?? EXAMPLE_MENTOR, { ...EXAMPLE_CONTEXT, ...s.ctx }),
    ...(s.note ? { note: s.note } : {}),
  }));
}

/** 문자 발송 탭(일반 문자) 필드 예시 — 발송과 같은 `renderBulkSms` 로 결과를 만든다 */
export function bulkSmsFieldExamples(key: BulkSmsFieldKey): SmsFieldExample[] {
  return build(BULK_SPECS[key], renderBulkSms);
}

/** 로그인 안내 문자 필드 예시 — 발송과 같은 `renderLoginGuide` 로 결과를 만든다 */
export function loginGuideFieldExamples(key: LoginGuideFieldKey): SmsFieldExample[] {
  return build(key === 'temp_password' ? TEMP_PASSWORD_SPECS : BULK_SPECS[key], renderLoginGuide);
}

/* ── 멘토 리마인더 ───────────────────────────────────────────── */

/** 예시용 가짜 리마인더 값 — 멘토 홍길동, 보고서 남은 멘티 김철수·이영희 */
export const EXAMPLE_REMINDER_VARS: MentorReminderVars = {
  program: '○○ 창업 멘토링',
  group: 'A그룹',
  mentor: '홍길동',
  companies: ['김철수', '이영희'],
};

interface ReminderSpec {
  title: string;
  input: string;
  vars?: Partial<MentorReminderVars>;
  who?: string;
  note?: string;
}

const REMINDER_SPECS: Record<MentorReminderFieldKey, ReminderSpec[]> = {
  program: [
    { title: T_ALONE, input: '{program}' },
    { title: T_SENTENCE, input: '[{program}] 이번 주 멘토링 회차 등록 안내입니다.' },
    { title: T_MIXED, input: '[{program}] {mentor} 멘토님, 이번 주도 [{companies}] 멘티 멘토링 잘 부탁드립니다.' },
  ],
  group: [
    { title: T_ALONE, input: '{group}' },
    {
      title: T_SENTENCE,
      input: '{group} 멘토링 진행 상황을 점검해 주세요.',
      note: '문구에 그룹명을 넣으면 멘토가 여러 그룹을 맡은 경우 그룹마다 한 통씩 나갑니다. 빼면 멘토마다 한 통으로 합쳐서 나갑니다.',
    },
    { title: T_MIXED, input: '[{program} · {group}] {mentor} 멘토님, [{companies}] 멘티의 보고서를 확인해 주세요.' },
  ],
  mentor: [
    { title: T_ALONE, input: '{mentor}' },
    { title: T_SENTENCE, input: '{mentor} 멘토님, 안녕하세요.' },
    { title: T_MIXED, input: '[{program}] {mentor} 멘토님, 이번 주 회차 등록을 부탁드립니다.' },
  ],
  companies: [
    { title: T_ALONE, input: '{companies}' },
    { title: T_SENTENCE, input: '보고서가 남은 멘티: {companies}' },
    { title: T_MIXED, input: '[{program}] {mentor}멘토님, 이번주에도 [{companies}] 멘티에 대한 컨설팅 회차 등록·보고서 작성 진행 잘 부탁드리겠습니다' },
    {
      title: '보고서가 남은 멘티가 1명일 때',
      input: '보고서가 남은 멘티: {companies}',
      vars: { companies: ['김철수'] },
      who: '보고서가 남은 멘티가 김철수 1명인 멘토 홍길동이 받을 때',
      note: '회차를 아직 진행 중인 담당 멘티만 들어갑니다. 종결 요청 등으로 회차를 마친 멘티는 빠집니다.',
    },
  ],
};

/** 멘토 리마인더 필드 예시 — 발송과 같은 `renderMentorReminder` 로 결과를 만든다 */
export function mentorReminderFieldExamples(key: MentorReminderFieldKey): SmsFieldExample[] {
  return REMINDER_SPECS[key].map((s) => ({
    title: s.title,
    who: s.who ?? `멘토 홍길동이 받을 때 (보고서 남은 멘티: 김철수, 이영희)`,
    input: s.input,
    output: renderMentorReminder(s.input, { ...EXAMPLE_REMINDER_VARS, ...s.vars }),
    ...(s.note ? { note: s.note } : {}),
  }));
}
