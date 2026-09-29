/**
 * 문자 발송 탭(일반 문자) 자동 기입 필드 — 서버(발송·예약 발송)·클라이언트(버튼·안내 표·미리보기) 공용 순수 모듈.
 * 'server-only' / 'use client' 없음(§6-10): 필드 목록·검증·렌더를 양쪽이 같은 함수로 쓴다.
 *
 * 필드와 치환 규칙은 로그인 안내 문자(`login-guide-template.ts`)와 **같은 렌더 함수**(`renderLoginGuide`)를 쓴다.
 *  - 임시 비밀번호 안내 `{temp_password}` 는 일반 문자에서 쓰지 않는다(회원 명단의 로그인 안내 문자 전용)
 *  - 화면에 보이는 이름·설명·예시는 이 모듈에서 일반인 눈높이로 다시 적는다(로그인 안내 라벨은 건드리지 않음).
 *    예시값은 전부 가짜 값(홍길동·○○ 창업 멘토링 …) — 실제 행사명 등 내부 값이 설명에 섞이지 않게 한다.
 */
import {
  LOGIN_GUIDE_FIELDS,
  renderLoginGuide,
  type LoginGuideContext,
  type LoginGuideFieldDef,
  type LoginGuideFieldKey,
  type LoginGuideRecipient,
  type LoginGuideRole,
} from '@/lib/sms/login-guide-template';

export type BulkSmsFieldKey = Exclude<LoginGuideFieldKey, 'temp_password'>;

/** 적용 대상 표기 */
export type BulkSmsFieldTarget = '공통' | '멘토만' | '멘티만';

export interface BulkSmsFieldDef extends LoginGuideFieldDef {
  key: BulkSmsFieldKey;
  /** 적용 대상 (공통 / 멘토만 / 멘티만) */
  target: BulkSmsFieldTarget;
}

/** 일반 문자용 표기 — 쉬운 말 이름·설명·가짜 예시 */
const PLAIN: Record<BulkSmsFieldKey, { label: string; desc: string; sample: string }> = {
  name: { label: '수신자 이름', desc: '문자를 받는 사람의 이름', sample: '홍길동' },
  role: { label: '역할', desc: '받는 사람이 이 사업에서 맡은 역할 (멘토·멘티·운영사·발주처)', sample: '멘토' },
  login_id: { label: '아이디(이메일)', desc: '받는 사람이 로그인할 때 쓰는 이메일 주소', sample: 'hong@example.com' },
  phone: { label: '휴대폰', desc: '받는 사람의 휴대폰 번호', sample: '010-1234-5678' },
  login_url: { label: '로그인 주소', desc: '플랫폼에 들어가는 로그인 화면 인터넷 주소', sample: 'https://○○○.kr/login' },
  program: { label: '행사명', desc: '지금 운영 중인 행사(사업) 이름', sample: '○○ 창업 멘토링' },
  organization: { label: '소속', desc: '받는 사람의 소속 (회사·기관·팀 이름)', sample: '○○컨설팅' },
  group: { label: '그룹명', desc: '받는 사람이 속한 사업 그룹 (여러 개면 쉼표로 이어서)', sample: 'A그룹' },
  mentees: { label: '담당 멘티 이름', desc: '멘토가 맡은 멘티 이름 (여러 명이면 쉼표로 이어서)', sample: '김철수, 이영희' },
  mentee_phones: { label: '담당 멘티 휴대폰', desc: '멘토가 맡은 멘티 휴대폰 번호 (멘티 이름과 같은 순서)', sample: '010-1111-2222, 010-3333-4444' },
  mentee_contacts: { label: '담당 멘티 연락처', desc: '멘토가 맡은 멘티의 "이름 휴대폰" 묶음', sample: '김철수 010-1111-2222, 이영희 010-3333-4444' },
  mentor: { label: '담당 멘토 이름', desc: '멘티를 맡은 멘토 이름', sample: '박멘토' },
  mentor_phone: { label: '담당 멘토 휴대폰', desc: '멘티를 맡은 멘토의 휴대폰 번호', sample: '010-5555-6666' },
  footer: { label: '하단 문구', desc: '사업 설정에 등록해 둔 문자 맨 아래 안내 문구 (없으면 비워 둠)', sample: '(문의: ○○ 사무국 000-000-0000)' },
};

function targetOf(only: LoginGuideRole | undefined): BulkSmsFieldTarget {
  return only === 'mentor' ? '멘토만' : only === 'mentee' ? '멘티만' : '공통';
}

/** 일반 문자에서 쓸 수 있는 자동 기입 필드 (로그인 안내 필드 − 임시 비밀번호 안내) */
export const BULK_SMS_FIELDS: BulkSmsFieldDef[] = LOGIN_GUIDE_FIELDS.filter(
  (f): f is LoginGuideFieldDef & { key: BulkSmsFieldKey } => f.key !== 'temp_password',
).map((f) => ({ ...f, ...PLAIN[f.key], target: targetOf(f.only) }));

const BULK_KEYS = new Set<string>(BULK_SMS_FIELDS.map((f) => f.key));

/** 버튼 표기 — 예) "수신자 이름 : {name}" */
export function buttonLabel(def: Pick<BulkSmsFieldDef, 'label' | 'key'>): string {
  return `${def.label} : {${def.key}}`;
}

/** 로그인 안내 템플릿과 같은 자리표시자 문법 `{키}` */
const PLACEHOLDER = /\{([^{}\n]{1,30})\}/g;

function placeholderKeys(text: string): string[] {
  return Array.from(text.matchAll(PLACEHOLDER), (m) => m[1]!);
}

/** 문구에 쓰인 자동 기입 필드 키 (중복 제거, 등장 순) */
export function bulkFieldsUsed(text: string): BulkSmsFieldKey[] {
  return Array.from(new Set(placeholderKeys(text).filter((k) => BULK_KEYS.has(k)))) as BulkSmsFieldKey[];
}

/** 자동 기입 필드를 하나라도 쓰는지 */
export function usesBulkFields(text: string): boolean {
  return bulkFieldsUsed(text).length > 0;
}

/**
 * 발송·예약 전 검증 — 오류 문구 또는 null. 서버 액션과 화면이 같은 규칙을 쓴다.
 * (빈 문구 검사는 호출부가 한다)
 */
export function validateBulkSmsText(text: string): string | null {
  const keys = placeholderKeys(text);
  if (keys.includes('temp_password')) {
    return '임시 비밀번호 안내 {temp_password} 는 이 화면에서 쓸 수 없습니다. 회원 명단의 [로그인 안내 문자]로 보내 주세요.';
  }
  const unknown = Array.from(new Set(keys.filter((k) => !BULK_KEYS.has(k)))).map((k) => `{${k}}`);
  if (unknown.length) {
    return `알 수 없는 자동 기입 필드가 있습니다: ${unknown.join(', ')} — 아래 '자동 기입 필드 안내' 표에 있는 필드만 쓸 수 있습니다. 중괄호 { } 를 글자 그대로 쓰려면 지워 주세요.`;
  }
  return null;
}

/**
 * 수신자 1명의 최종 문자 본문. 미리보기·즉시 발송·예약 발송 공용.
 * 로그인 안내 문자와 같은 렌더 함수 — 값이 없는 선택 필드만 있는 줄은 통째로 빠지고,
 * 그 밖의 빈 값은 '-' 로 표시된다(멘토 전용 필드를 멘티가 받으면 '-' 또는 줄 생략).
 */
export function renderBulkSms(text: string, recipient: LoginGuideRecipient, ctx: LoginGuideContext): string {
  return renderLoginGuide(text, recipient, ctx);
}

/**
 * 치환 데이터를 불러오지 못한 수신자용 최소 데이터 — 이름·휴대폰 등 가진 값만 채운다.
 * (사업명·로그인 주소·하단 문구는 ctx 에서 들어가므로 그대로 치환된다)
 */
export function fallbackBulkRecipient(r: { id: string; name: string; role: LoginGuideRole; phone?: string | null; email?: string | null; organization?: string | null }): LoginGuideRecipient {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    email: r.email ?? null,
    phone: r.phone ?? null,
    mustChangePassword: false,
    organization: r.organization ?? null,
    groupNames: [],
    mentees: [],
    mentors: [],
    skip: null,
  };
}

/** 예시 치환 데이터 — 수신자를 아직 모를 때(비용 어림) 쓰는 가짜 값 */
export const SAMPLE_BULK_CONTEXT: LoginGuideContext = {
  programName: PLAIN.program.sample,
  loginUrl: PLAIN.login_url.sample,
  footer: PLAIN.footer.sample,
};

/** 역할별 예시 수신자 (가짜 값) */
export function sampleBulkRecipient(role: LoginGuideRole): LoginGuideRecipient {
  return {
    id: 'sample',
    name: PLAIN.name.sample,
    role,
    email: PLAIN.login_id.sample,
    phone: PLAIN.phone.sample,
    mustChangePassword: false,
    organization: PLAIN.organization.sample,
    groupNames: [PLAIN.group.sample],
    mentees: role === 'mentor' ? [{ name: '김철수', phone: '010-1111-2222' }, { name: '이영희', phone: '010-3333-4444' }] : [],
    mentors: role === 'mentee' ? [{ name: PLAIN.mentor.sample, phone: PLAIN.mentor_phone.sample }] : [],
    skip: null,
  };
}
