import { fmt, type Branding } from '@/lib/programs/branding';

/**
 * trigger_event → 알림 템플릿 코드·본문 (docs/MODU-DESIGN.md §9).
 * 문구에 기관명을 쓰지 않는다 — `{client}` `{operator}` `{program}` 은 발송 시 행사 브랜딩으로 치환된다.
 */
export const NOTIFICATION_TEMPLATES: Record<string, { code: string; text: string }> = {
  mentor_assigned: {
    code: 'MENTOR_ASSIGNED',
    text: '[{program}] 멘토가 배정되었습니다. 담당 멘토의 연락을 기다려 주세요.',
  },
  round_registered: {
    code: 'ROUND_REGISTERED',
    text: '[{program}] 컨설팅 회차가 등록되었습니다. 내용을 확인하고 서명해 주세요.',
  },
  round_signed: { code: 'ROUND_SIGNED', text: '[{program}] 멘티가 회차에 서명했습니다.' },
  extension_requested: {
    code: 'EXTENSION_REQUESTED',
    text: '[{program}] 추가 회차 요청이 접수되었습니다. 요청함을 확인해 주세요.',
  },
  extension_decided: { code: 'EXTENSION_DECIDED', text: '[{program}] 추가 회차 요청이 처리되었습니다.' },
  mentor_change_requested: {
    code: 'MENTOR_CHANGE_REQUESTED',
    text: '[{program}] 멘티의 멘토 변경 요청이 접수되었습니다.',
  },
  mentor_change_decided: {
    code: 'MENTOR_CHANGE_DECIDED',
    text: '[{program}] 멘토 변경 요청이 처리되었습니다.',
  },
  mentor_withdrawal_requested: {
    code: 'MENTOR_WITHDRAWAL_REQUESTED',
    text: '[{program}] 멘토의 중도 종료 요청이 접수되었습니다.',
  },
  mentor_ended: {
    code: 'MENTOR_ENDED',
    text: '[{program}] 담당 멘토가 변경될 예정입니다. {operator}가 새 멘토를 배정합니다.',
  },
  closure_requested: {
    code: 'CLOSURE_REQUESTED',
    text: '[{program}] 종결 요청(관찰의견서)이 접수되었습니다. 검수를 진행해 주세요.',
  },
  revision_requested: {
    code: 'REVISION_REQUESTED',
    text: '[{program}] {operator}의 보완 요청이 있습니다. 내용을 확인해 주세요.',
  },
  settlement_confirmed: {
    code: 'SETTLEMENT_CONFIRMED',
    text: '[{program}] 정산이 확정되었습니다. 정산 내역을 확인해 주세요.',
  },
  settlement_canceled: {
    code: 'SETTLEMENT_CANCELED',
    text: '[{program}] 확정됐던 정산이 취소되었습니다. 회차 정정 후 다시 확정됩니다.',
  },
  batch_submitted: {
    code: 'BATCH_SUBMITTED',
    text: '[{program}] 지급 품의가 제출되었습니다. 정산 확인을 진행해 주세요.',
  },
  // (P31) 품의 흐름 보강 — 발주처: 철회 통보 / 운영사: 반려·확인 통보 / 멘토: 지급 완료(실지급액은 payload.message)
  batch_unsubmitted: {
    code: 'BATCH_UNSUBMITTED',
    text: '[{program}] {operator}가 제출했던 지급 품의를 철회했습니다. 수정 후 다시 제출됩니다.',
  },
  batch_returned: {
    code: 'BATCH_RETURNED',
    text: '[{program}] {client}가 지급 품의를 반려했습니다. 품의 메모의 반려 사유를 확인하고 다시 제출해 주세요.',
  },
  batch_confirmed: {
    code: 'BATCH_CONFIRMED',
    text: '[{program}] {client}가 지급 품의의 정산을 확인했습니다. 지급 후 [지급 완료]를 표시해 주세요.',
  },
  settlement_paid: {
    code: 'SETTLEMENT_PAID',
    text: '[{program}] 멘토링 정산금 지급이 완료되었습니다.',
  },
  case_closed: { code: 'CASE_CLOSED', text: '[{program}] 케이스가 종결되었습니다.' },
  case_withdrawn: { code: 'CASE_WITHDRAWN', text: '[{program}] 케이스가 중도 종료되었습니다.' },
  // 만족도 조사 개시 (closure.ts 가 목표 회차 완료 시 큐 — 상세 문구는 payload.message)
  survey_opened: { code: 'SURVEY_OPENED', text: '[{program}] 컨설팅이 마무리 단계입니다.' },
  survey_reminder: {
    code: 'SURVEY_REMINDER',
    text: '[{program}] 만족도 조사에 아직 응답하지 않으셨습니다. 참여 부탁드립니다.',
  },
  closure_overdue: {
    code: 'CLOSURE_OVERDUE',
    text: '[{program}] 종결 요청 후 3일이 지난 검수 대기 건이 있습니다. 확인 부탁드립니다.',
  },
};

export function templateFor(triggerEvent: string): { code: string; text: string } {
  return NOTIFICATION_TEMPLATES[triggerEvent] ?? { code: 'GENERIC', text: '[{program}] 알림이 있습니다.' };
}

/**
 * 자동발송 단계 (문자 발송 › 자동발송 탭) — 업무 흐름 순서. 화면은 이 순서대로 묶는다.
 */
export const AUTO_SEND_STAGES = [
  { key: 'register', label: '등록·로그인 안내' },
  { key: 'matching', label: '매칭·배정' },
  { key: 'rounds', label: '회차·보고서·서명' },
  { key: 'closure', label: '종결·검수' },
  { key: 'settlement', label: '정산·품의' },
  { key: 'survey', label: '만족도·조사' },
  { key: 'reminder', label: '리마인더·지연' },
  { key: 'system', label: '시스템·보안' },
] as const;
export type AutoSendStage = (typeof AUTO_SEND_STAGES)[number]['key'];

/** 알림 이벤트 정의 (P32) — 자동발송 탭의 큐 알림 on/off 목록. 키 = NOTIFICATION_TEMPLATES 의 trigger_event 전부. */
export interface NotificationEventDef {
  key: string;
  label: string;
  /** 주 수신자. 둘 이상이면 recipients 에 병기 */
  audience: '멘토' | '멘티' | '운영사' | '발주처';
  /** 화면 표기용 수신자 (예: '멘토·멘티') */
  recipients: string;
  /** 발송 시점(트리거) 설명 */
  desc: string;
  /** 업무 단계 (자동발송 탭 묶음) */
  stage: AutoSendStage;
  /** 문구 미리보기에 덧붙일 건별 문구 예시 (dispatch 가 payload.message 를 템플릿 뒤에 붙이는 이벤트) */
  sampleExtra?: string;
  /** 정산·품의 게이트 알림 — 끄면 지급 흐름이 멈출 수 있어 화면에서 잠그고(항상 켬) 액션도 false 저장을 거부한다 */
  lockable?: boolean;
}

export const NOTIFICATION_EVENT_DEFS: NotificationEventDef[] = [
  // ---- 매칭·배정
  { key: 'mentor_assigned', label: '멘토 배정', audience: '멘티', recipients: '멘토·멘티', stage: 'matching', desc: '멘토 배정·재배정 시' },
  { key: 'mentor_change_requested', label: '멘토 변경 요청 접수', audience: '운영사', recipients: '운영사(검수 권한)', stage: 'matching', desc: '멘티가 멘토 변경을 요청했을 때' },
  { key: 'mentor_change_decided', label: '멘토 변경 요청 처리 결과', audience: '멘티', recipients: '멘티', stage: 'matching', desc: '멘티의 멘토 변경 요청을 수락·반려했을 때', sampleExtra: '요청이 수락되어 새 멘토가 배정되었습니다.' },
  { key: 'mentor_withdrawal_requested', label: '멘토 중도 종료 요청 접수', audience: '운영사', recipients: '운영사(검수 권한)', stage: 'matching', desc: '멘토가 자진 중도 종료를 요청했을 때' },
  { key: 'mentor_ended', label: '담당 멘토 종료(재배정 대기)', audience: '멘티', recipients: '멘토·멘티', stage: 'matching', desc: '멘토 중도 종료 승인·운영사 강제 종료·중도 종료 복귀 시' },
  // ---- 회차·보고서·서명
  { key: 'round_registered', label: '회차 보고서 확인·서명 안내', audience: '멘티', recipients: '멘티', stage: 'rounds', desc: '보고서(2단계) 등록 시 — 멘티 확인 서명 정책이 켜진 그룹만, 발송 직전 이미 서명했으면 생략' },
  { key: 'round_signed', label: '멘티 회차 서명 완료', audience: '멘토', recipients: '멘토', stage: 'rounds', desc: '멘티가 회차 보고서에 서명했을 때 (현장 서명 제외)' },
  { key: 'extension_requested', label: '추가 회차 요청 접수', audience: '운영사', recipients: '운영사(검수 권한)', stage: 'rounds', desc: '멘토가 추가 회차를 요청했을 때' },
  { key: 'extension_decided', label: '추가 회차 요청 처리 결과', audience: '멘토', recipients: '멘토', stage: 'rounds', desc: '추가 회차 요청을 승인·반려했을 때', sampleExtra: '추가 1회가 승인되었습니다.' },
  // ---- 종결·검수
  { key: 'closure_requested', label: '종결 요청 접수', audience: '운영사', recipients: '운영사(검수 권한)', stage: 'closure', desc: '멘토가 관찰의견서를 제출하고 종결을 요청했을 때' },
  { key: 'revision_requested', label: '검수 보완 요청', audience: '멘토', recipients: '멘토', stage: 'closure', desc: '운영사가 종결 검수에서 보완을 요청했을 때', sampleExtra: '(보완 요청 사유 앞 80자)' },
  { key: 'case_withdrawn', label: '케이스 중도 종료', audience: '멘티', recipients: '멘토·멘티 (발주처가 종료하면 운영사도)', stage: 'closure', desc: '케이스를 중도 종료했을 때' },
  { key: 'case_closed', label: '케이스 종결', audience: '멘티', recipients: '멘토·멘티', stage: 'closure', desc: '발주처 정산 확인으로 종결이 확정됐을 때' },
  // ---- 정산·품의
  { key: 'settlement_confirmed', label: '정산 확정', audience: '멘토', recipients: '멘토', stage: 'settlement', desc: '검수 승인·부분 정산으로 정산이 확정됐을 때', sampleExtra: '(멘티) — (유형별 회차·실지급 요약)' },
  { key: 'settlement_canceled', label: '정산 취소', audience: '멘토', recipients: '멘토', stage: 'settlement', desc: '확정됐던 정산을 취소했을 때', sampleExtra: '(취소 사유 앞 80자)' },
  { key: 'batch_submitted', label: '지급 품의 제출', audience: '발주처', recipients: '발주처', stage: 'settlement', desc: '운영사가 지급 품의를 제출했을 때' },
  { key: 'batch_unsubmitted', label: '지급 품의 철회', audience: '발주처', recipients: '발주처', stage: 'settlement', desc: '운영사가 제출했던 품의를 철회했을 때' },
  { key: 'batch_returned', label: '품의 반려 통보', audience: '운영사', recipients: '운영사(품의 권한)', stage: 'settlement', desc: '발주처가 지급 품의를 반려했을 때' },
  { key: 'batch_confirmed', label: '품의 정산 확인 통보', audience: '운영사', recipients: '운영사(품의 권한)', stage: 'settlement', desc: '발주처가 지급 품의의 정산을 확인했을 때' },
  { key: 'settlement_paid', label: '정산금 지급 완료', audience: '멘토', recipients: '멘토', stage: 'settlement', desc: '품의 [지급 완료] 표시 시 멘토별 실지급액 통보', sampleExtra: '실지급 327,360원 (2026-10-15)' },
  // ---- 만족도·조사
  { key: 'survey_opened', label: '만족도 조사 안내', audience: '멘티', recipients: '멘티', stage: 'survey', desc: '종결 요청 시 활성 양식이 있고 미응답이면', sampleExtra: '만족도 조사가 열렸습니다. 마이페이지에서 참여해 주세요.' },
  { key: 'survey_reminder', label: '만족도 조사 독려(종결 시)', audience: '멘티', recipients: '멘티', stage: 'survey', desc: '발주처 정산 확인(종결) 시 미응답 멘티에게' },
  // ---- 리마인더·지연
  { key: 'closure_overdue', label: '검수 지연 알림', audience: '운영사', recipients: '운영사(검수 권한·담당 그룹)', stage: 'reminder', desc: '종결 요청 후 3일 지난 검수 대기 건 (매일 KST 09:00 점검 · 같은 케이스 7일 중복 방지)' },
];

/**
 * 큐를 거치지 않는 **직발송 자동 문자** 중 행사별로 끌 수 있는 것 (문자 발송 › 자동발송 탭).
 * 설정은 알림 이벤트와 같은 `programs.notification_settings` 에 같은 규칙(키 없음 = 켬, `false` 만 저장)으로 둔다.
 */
export interface DirectAutoSendDef {
  key: 'auto_login_guide_on_matched' | 'survey_reminder_auto' | 'retention_notice';
  label: string;
  recipients: string;
  desc: string;
  stage: AutoSendStage;
}

export const DIRECT_AUTO_SEND_DEFS: DirectAutoSendDef[] = [
  {
    key: 'auto_login_guide_on_matched',
    label: '전원 배정 완료 → 멘토 로그인 안내',
    recipients: '멘토(그 그룹에 배정된)',
    stage: 'matching',
    desc: '그룹(라운드)의 등록 멘티 전원이 배정 완료되면 배정 멘토에게 1회. 꺼 둔 동안은 발송 기록이 남지 않으므로, 다시 켜면 그 뒤 첫 배정 확정 때 아직 안내받지 못한 멘토에게 나갑니다.',
  },
  {
    key: 'survey_reminder_auto',
    label: '만족도 미응답 1주 자동 독려',
    recipients: '멘티',
    stage: 'survey',
    desc: '만족도 조사가 열린 지 7일이 지나도 미응답이면 케이스당 1회 (매일 KST 10:00 점검). 꺼 둔 동안은 대상에서 빠지고, 다시 켜면 그 다음 점검 때 발송됩니다.',
  },
  {
    key: 'retention_notice',
    label: '개인정보 보존기간 만료 안내',
    recipients: '플랫폼 관리자·개인정보 보호책임자(행사 기본 설정)',
    stage: 'system',
    desc: '행사 종료일 + 보존기간 만료 30일 전부터 30일 간격 (매주 월 KST 09:00 점검). 자동 파기는 하지 않습니다.',
  },
];

/** 자동발송 탭에서 켜고 끌 수 있는 키 전부 (알림 이벤트 + 직발송 자동 문자) */
export const AUTO_SEND_TOGGLE_KEYS: string[] = [...NOTIFICATION_EVENT_DEFS.map((d) => d.key), ...DIRECT_AUTO_SEND_DEFS.map((d) => d.key)];

/**
 * 행사 설정(programs.notification_settings)에서 이벤트 발송 여부 해석 (P32).
 * 키 없음 = 발송, 정확히 `false` 만 미발송. 잘못된 값(비객체)은 전부 발송.
 */
export function notificationEnabled(settings: unknown, event: string): boolean {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return true;
  return (settings as Record<string, unknown>)[event] !== false;
}

/**
 * 자동발송 on/off 해석 — 알림 이벤트와 직발송 자동 문자 공용. 규칙은 `notificationEnabled` 와 같다(키 없음 = 켬, `false` 만 끔).
 */
export function autoSendEnabled(settings: unknown, key: string): boolean {
  return notificationEnabled(settings, key);
}

/**
 * 저장 입력 검증·정규화 — `{ key: boolean }` → 저장할 `{ key: false }` 만.
 * 알 수 없는 키·불리언 아닌 값·잠긴(lockable) 이벤트의 false 는 오류. true 는 기본값이라 키를 남기지 않는다.
 */
export function normalizeAutoSendSettings(map: unknown): { ok: true; next: Record<string, false> } | { ok: false; error: string } {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return { ok: false, error: '입력값을 확인하세요.' };
  const events = new Map(NOTIFICATION_EVENT_DEFS.map((d) => [d.key, d]));
  const direct = new Map(DIRECT_AUTO_SEND_DEFS.map((d) => [d.key as string, d]));
  const next: Record<string, false> = {};
  for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
    const ev = events.get(key);
    const dr = direct.get(key);
    if (!ev && !dr) return { ok: false, error: `알 수 없는 자동발송 항목입니다: ${key}` };
    if (typeof value !== 'boolean') return { ok: false, error: `값이 올바르지 않습니다: ${key}` };
    if (value) continue;
    if (ev?.lockable) return { ok: false, error: `'${ev.label}' 알림은 끌 수 없습니다 (정산·품의 게이트).` };
    next[key] = false;
  }
  return { ok: true, next };
}

/** 저장 전후 비교 — 감사 로그의 바뀐 키 목록 (켬↔끔). 이전 값에 남은 알 수 없는 키도 비교한다. */
export function diffAutoSendSettings(before: unknown, after: unknown): { key: string; on: boolean }[] {
  const keys = new Set<string>(AUTO_SEND_TOGGLE_KEYS);
  for (const src of [before, after]) {
    if (src && typeof src === 'object' && !Array.isArray(src)) for (const k of Object.keys(src)) keys.add(k);
  }
  const out: { key: string; on: boolean }[] = [];
  keys.forEach((k) => {
    const a = autoSendEnabled(before, k);
    const b = autoSendEnabled(after, k);
    if (a !== b) out.push({ key: k, on: b });
  });
  return out;
}

/** 큐 알림 문구 — dispatch 와 같은 조립(템플릿 치환 + 건별 문구 + 행사 문자 꼬리말). 미리보기에 쓴다. */
export function renderNotificationText(event: string, branding: Branding, extra?: string | null): string {
  const tpl = templateFor(event);
  return fmt(tpl.text, branding) + (extra ? ` ${extra}` : '') + (branding.smsFooter ? ` ${branding.smsFooter}` : '');
}

// ---------------------------------------------------------------------------
// 직발송 자동 문자 문구 — 발송 코드와 자동발송 탭 미리보기가 같은 함수를 쓴다.
// ---------------------------------------------------------------------------

/** 전원 배정 완료 시 매칭 멘토 로그인 안내 (auto-match.ts notifyMentorsIfAllMatched) */
export function buildMatchedMentorLoginGuideText(v: { programName: string; mentorName: string; email: string | null; appUrl: string; mustChangePassword: boolean; footer?: string | null }): string {
  const lines = [
    `[${v.programName}] ${v.mentorName} 멘토님, 담당 멘티 배정이 확정되었습니다.`,
    '플랫폼에 로그인하여 배정된 멘티를 확인해 주세요.',
    v.appUrl ? `${v.appUrl}/login` : '',
    `아이디: 이메일(${v.email ?? '-'}) 또는 휴대폰 번호`,
  ].filter(Boolean);
  if (v.mustChangePassword) lines.push('첫 로그인 시 비밀번호를 새로 설정해야 합니다. 임시 비밀번호는 등록 시 안내된 값(기본: 본인 휴대폰 번호 숫자)입니다.');
  if (v.footer) lines.push(v.footer);
  return lines.join('\n');
}

/** 만족도 미응답 1주 자동 독려 (surveys/satisfaction.ts sendAutoSurveyReminders) */
export function buildSurveyAutoReminderText(v: { programName: string; menteeName: string; appUrl: string; footer?: string | null }): string {
  return `[${v.programName}] ${v.menteeName}님, 멘토링 만족도 조사가 아직 완료되지 않았습니다. 참여 부탁드립니다.\n${v.appUrl}/mentee/survey (로그인 후 응답)${v.footer ? `\n${v.footer}` : ''}`;
}

/** 보존기간 만료 안내의 발신 머리말 — 기관명 리터럴 금지(플랫폼 공통 문구) */
export const RETENTION_NOTICE_PLATFORM_NAME = '멘토링 운영관리 플랫폼';

/** 개인정보 보존기간 만료 안내 (Cron retention-check) */
export function buildRetentionNoticeText(v: { programName: string; expiry: string; expired: boolean; years: number }): string {
  return [
    `[${RETENTION_NOTICE_PLATFORM_NAME}] 개인정보 보존기간 만료 ${v.expired ? '경과' : '예정'} — 파기 검토 필요`,
    `행사: ${v.programName}`,
    `보존 만료일: ${v.expiry} (종료 후 ${v.years}년)`,
    '자동 파기는 되지 않습니다. 보호책임자·운영사 PL 이 파기 대상과 예외(정산 증빙)를 검토해 주세요.',
  ].join('\n');
}
