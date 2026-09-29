/**
 * 로그인 안내 문자 템플릿 — 서버(발송)·클라이언트(미리보기) 공용 순수 모듈.
 * 'server-only' / 'use client' 없음: 미리보기와 실제 발송 문구가 **같은 함수**에서 나온다.
 *
 * 문법: `{키}` (영문 소문자·밑줄). 예) `{name}님, {program} 멘토링 플랫폼에 등록되었습니다.`
 *  - 값이 없는 필드는 '-' 로 표시 (임시 비밀번호 안내·하단 문구는 빈칸)
 *  - 선택 필드(임시 비밀번호 안내·하단 문구·소속·그룹·매칭 정보)만 있는 줄에서 그 값이 **전부 비면 줄째 생략**
 *    (예: "담당 멘티: {mentees}" — 배정 전이면 줄이 빠짐). 기본 필드(이름·역할·아이디·휴대폰·로그인 주소·행사명)가 있는 줄은 남는다
 */
import { formatPhone } from '@/lib/utils/phone';

/** 템플릿 최대 길이 (문자 수) */
export const LOGIN_GUIDE_TEMPLATE_MAX = 1000;
/** SMS 한도(바이트) — 넘으면 LMS 로 발송된다 */
export const SMS_BYTE_LIMIT = 90;
/** LMS 한도(바이트) */
export const LMS_BYTE_LIMIT = 2000;

/** 임시 비밀번호 안내 문장 — 비밀번호를 아직 바꾸지 않은 회원에게만 들어간다 */
export const TEMP_PASSWORD_LINE = '임시 비밀번호: 본인 휴대폰 번호(숫자만). 첫 로그인 시 비밀번호를 변경해 주세요.';

export type LoginGuideRole = 'institution' | 'nextlab' | 'mentor' | 'mentee';

const ROLE_TEXT: Record<LoginGuideRole, string> = {
  institution: '발주처',
  nextlab: '운영사',
  mentor: '멘토',
  mentee: '멘티',
};

export type LoginGuideSkip = 'no_phone' | 'inactive_member' | 'account_locked';

export const LOGIN_GUIDE_SKIP_LABELS: Record<LoginGuideSkip, string> = {
  no_phone: '휴대폰 없음',
  inactive_member: '이 행사 비활성화',
  account_locked: '계정 잠금',
};

/** 수신자 1명의 치환 데이터 (서버 액션이 JSON 으로 돌려준다) */
export interface LoginGuideRecipient {
  id: string;
  name: string;
  role: LoginGuideRole;
  email: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  organization: string | null;
  groupNames: string[];
  /** 멘토: 현재 범위의 활성 배정 멘티 */
  mentees: { name: string; phone: string | null }[];
  /** 멘티: 현재 범위의 활성 담당 멘토 (케이스가 여러 건이면 여러 명) */
  mentors: { name: string; phone: string | null }[];
  /** 발송 제외 사유 (null = 발송 대상) */
  skip: LoginGuideSkip | null;
}

/** 행사 공통 치환 데이터 */
export interface LoginGuideContext {
  programName: string;
  loginUrl: string;
  footer: string | null;
}

export type LoginGuideFieldKey =
  | 'name'
  | 'role'
  | 'login_id'
  | 'phone'
  | 'login_url'
  | 'temp_password'
  | 'program'
  | 'organization'
  | 'group'
  | 'mentees'
  | 'mentee_phones'
  | 'mentee_contacts'
  | 'mentor'
  | 'mentor_phone'
  | 'footer';

export interface LoginGuideFieldDef {
  key: LoginGuideFieldKey;
  /** 칩 라벨 */
  label: string;
  /** 의미 설명 */
  desc: string;
  /** 미리보기 대상이 없을 때 보여줄 예시값 */
  sample: string;
  /** 선택 필드 — 이 필드들만 있는 줄은 값이 전부 비면 줄째 생략 */
  optional: boolean;
  /** 값이 없을 때 '-' 대신 빈칸 (문장·꼬리말형 필드) */
  blankWhenEmpty?: boolean;
  /** 특정 역할 전용 (없으면 공통) */
  only?: LoginGuideRole;
}

export const LOGIN_GUIDE_FIELDS: LoginGuideFieldDef[] = [
  { key: 'name', label: '받는 사람 이름', desc: '문자를 받는 회원 이름', sample: '홍길동', optional: false },
  { key: 'role', label: '역할', desc: '이 행사에서의 역할 (멘토/멘티)', sample: '멘토', optional: false },
  { key: 'login_id', label: '아이디(이메일)', desc: '로그인 아이디로 쓰는 이메일', sample: 'hong@example.com', optional: false },
  { key: 'phone', label: '휴대폰', desc: '받는 사람 휴대폰 번호', sample: '010-1234-5678', optional: false },
  { key: 'login_url', label: '로그인 주소', desc: '플랫폼 로그인 화면 주소', sample: 'https://…/login', optional: false },
  { key: 'temp_password', label: '임시 비밀번호 안내', desc: '비밀번호를 아직 바꾸지 않은 회원에게만 안내 문장이 들어감', sample: TEMP_PASSWORD_LINE, optional: true, blankWhenEmpty: true },
  { key: 'program', label: '행사명', desc: '현재 행사 이름', sample: '○○ 창업 멘토링', optional: false },
  { key: 'organization', label: '소속', desc: '회원 소속(회사·기관·팀명)', sample: '○○컨설팅', optional: true },
  { key: 'group', label: '그룹명', desc: '배정·케이스가 있는 사업그룹(여러 개면 쉼표)', sample: 'A그룹', optional: true },
  { key: 'mentees', label: '매칭 멘티명', desc: '담당 멘티 이름(여러 명이면 쉼표)', sample: '김철수, 이영희', optional: true, only: 'mentor' },
  { key: 'mentee_phones', label: '매칭 멘티 휴대폰', desc: '담당 멘티 휴대폰(멘티명과 같은 순서, 쉼표)', sample: '010-1111-2222, 010-3333-4444', optional: true, only: 'mentor' },
  { key: 'mentee_contacts', label: '매칭 멘티(이름+휴대폰)', desc: '담당 멘티 "이름 휴대폰" 묶음(쉼표)', sample: '김철수 010-1111-2222, 이영희 010-3333-4444', optional: true, only: 'mentor' },
  { key: 'mentor', label: '담당 멘토명', desc: '배정된 멘토 이름', sample: '박멘토', optional: true, only: 'mentee' },
  { key: 'mentor_phone', label: '담당 멘토 휴대폰', desc: '배정된 멘토 휴대폰', sample: '010-5555-6666', optional: true, only: 'mentee' },
  { key: 'footer', label: '하단 문구', desc: '행사 설정의 문자 하단 문구(없으면 생략)', sample: '(수신 거부: 운영 사무국)', optional: true, blankWhenEmpty: true },
];

const FIELD_BY_KEY = new Map<string, LoginGuideFieldDef>(LOGIN_GUIDE_FIELDS.map((f) => [f.key, f]));

/** 해당 역할에서 쓸 수 있는 필드 (공통 + 역할 전용) */
export function fieldsForRole(role: LoginGuideRole): LoginGuideFieldDef[] {
  return LOGIN_GUIDE_FIELDS.filter((f) => !f.only || f.only === role);
}

const PLACEHOLDER = /\{([^{}\n]{1,30})\}/g;

function phoneText(p: string | null | undefined): string {
  return formatPhone(p) ?? (p ?? '').trim();
}

/** 필드 하나의 값 ('' = 값 없음) */
export function loginGuideFieldValue(key: LoginGuideFieldKey, r: LoginGuideRecipient, ctx: LoginGuideContext): string {
  switch (key) {
    case 'name':
      return r.name.trim();
    case 'role':
      return ROLE_TEXT[r.role] ?? '';
    case 'login_id':
      return (r.email ?? '').trim();
    case 'phone':
      return phoneText(r.phone);
    case 'login_url':
      return ctx.loginUrl.trim();
    case 'temp_password':
      return r.mustChangePassword ? TEMP_PASSWORD_LINE : '';
    case 'program':
      return ctx.programName.trim();
    case 'organization':
      return (r.organization ?? '').trim();
    case 'group':
      return r.groupNames.filter(Boolean).join(', ');
    case 'mentees':
      return r.mentees.map((m) => m.name).filter(Boolean).join(', ');
    case 'mentee_phones':
      return r.mentees.some((m) => phoneText(m.phone)) ? r.mentees.map((m) => phoneText(m.phone) || '-').join(', ') : '';
    case 'mentee_contacts':
      return r.mentees.map((m) => [m.name, phoneText(m.phone)].filter(Boolean).join(' ')).filter(Boolean).join(', ');
    case 'mentor':
      return r.mentors.map((m) => m.name).filter(Boolean).join(', ');
    case 'mentor_phone':
      return r.mentors.some((m) => phoneText(m.phone)) ? r.mentors.map((m) => phoneText(m.phone) || '-').join(', ') : '';
    case 'footer':
      return (ctx.footer ?? '').trim();
  }
}

/**
 * 템플릿 → 최종 문자 본문. 미리보기·발송 공용.
 * 알 수 없는 `{키}` 는 그대로 남긴다(발송 전 `validateLoginGuideTemplate` 이 거부).
 */
export function renderLoginGuide(template: string, r: LoginGuideRecipient, ctx: LoginGuideContext): string {
  const cache = new Map<string, string>();
  const valueOf = (key: string): string => {
    if (!cache.has(key)) cache.set(key, loginGuideFieldValue(key as LoginGuideFieldKey, r, ctx));
    return cache.get(key)!;
  };
  const out: string[] = [];
  for (const line of template.replace(/\r\n?/g, '\n').split('\n')) {
    const keys = Array.from(line.matchAll(PLACEHOLDER), (m) => m[1]!).filter((k) => FIELD_BY_KEY.has(k));
    if (keys.length > 0 && keys.every((k) => FIELD_BY_KEY.get(k)!.optional && !valueOf(k))) continue; // 빈 선택 필드만 있는 줄 = 생략
    out.push(
      line
        .replace(PLACEHOLDER, (whole, k: string) => {
          const def = FIELD_BY_KEY.get(k);
          if (!def) return whole;
          const v = valueOf(k);
          return v || (def.blankWhenEmpty ? '' : '-');
        })
        .replace(/[ \t]+$/, ''),
    );
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 템플릿에 쓰인 알 수 없는 `{키}` 목록 (중복 제거) */
export function unknownPlaceholders(template: string): string[] {
  const set = new Set<string>();
  for (const k of Array.from(template.matchAll(PLACEHOLDER), (m) => m[1]!)) if (!FIELD_BY_KEY.has(k)) set.add(`{${k}}`);
  return Array.from(set);
}

/** 발송 전 검증 — 오류 문구 또는 null. 서버·클라이언트가 같은 규칙을 쓴다 */
export function validateLoginGuideTemplate(template: string): string | null {
  const t = template.trim();
  if (!t) return '문자 내용을 입력하세요.';
  if (t.length > LOGIN_GUIDE_TEMPLATE_MAX) return `문자 내용은 ${LOGIN_GUIDE_TEMPLATE_MAX}자 이내로 써 주세요. (현재 ${t.length}자)`;
  const unknown = unknownPlaceholders(t);
  if (unknown.length) return `알 수 없는 자동화 필드가 있습니다: ${unknown.join(', ')} — 아래 필드 표의 이름만 쓸 수 있습니다.`;
  return null;
}

/** 역할별 기본 템플릿 (이전 기본 문구와 같은 구성 + 매칭 정보 한 줄) */
export function defaultLoginGuideTemplate(role: LoginGuideRole): string {
  const who = role === 'mentor' ? '멘토로' : role === 'mentee' ? '멘티로' : '회원으로';
  const lines = [`[{program}] {name}님, '{program}' 멘토링 플랫폼에 ${who} 등록되었습니다.`];
  if (role === 'mentor') lines.push('담당 멘티: {mentees}');
  if (role === 'mentee') lines.push('담당 멘토: {mentor}');
  lines.push('{login_url}', '아이디: 이메일({login_id}) 또는 휴대폰 번호', '{temp_password}', '{footer}');
  return lines.join('\n');
}

/** 구 방식(첫 줄 문구만 직접 입력) 호환 — 입력한 첫 줄 뒤에 주소·아이디·임시 비밀번호·하단 문구를 붙인다 */
export function legacyHeadTemplate(head: string): string {
  return [head.trim(), '{login_url}', '아이디: 이메일({login_id}) 또는 휴대폰 번호', '{temp_password}', '{footer}'].join('\n');
}

/** 한글 등 비ASCII 2바이트 기준 길이 (SMS/LMS 판정 — 발송 클라이언트와 같은 기준) */
export function smsByteLength(text: string): number {
  let n = 0;
  for (const ch of text) n += (ch.codePointAt(0) ?? 0) <= 0x7f ? 1 : 2;
  return n;
}

/** 'SMS' | 'LMS' | 'TOO_LONG' */
export function smsKind(text: string): 'SMS' | 'LMS' | 'TOO_LONG' {
  const b = smsByteLength(text);
  return b <= SMS_BYTE_LIMIT ? 'SMS' : b <= LMS_BYTE_LIMIT ? 'LMS' : 'TOO_LONG';
}
