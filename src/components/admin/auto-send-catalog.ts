/**
 * 문자 발송 › 자동발송 탭의 행 목록 (P36). 서버·클라이언트 공용 순수 모듈 — 'use client' 파일이 아니다(§6-10).
 * 서버 페이지가 행사 브랜딩·리마인더 요약을 넘겨 행을 만들고, 직렬화 가능한 값(문자열·불리언)만 클라이언트로 넘긴다.
 *
 * 분류
 *  - toggle : 행사별로 끌 수 있는 자동발송 (큐 알림 이벤트 + 직발송 자동 문자) — programs.notification_settings
 *  - link   : 설정이 다른 탭에 있는 자동발송 (멘토 리마인더)
 *  - always : 보안·시스템 문자 — 항상 발송(끌 수 없음)
 *  - manual : 담당자가 직접 보내는 문자(자동 아님) — 어디서 보내는지 안내만
 */
import {
  AUTO_SEND_STAGES,
  DIRECT_AUTO_SEND_DEFS,
  NOTIFICATION_EVENT_DEFS,
  buildMatchedMentorLoginGuideText,
  buildRetentionNoticeText,
  buildSurveyAutoReminderText,
  renderNotificationText,
  type AutoSendStage,
} from '@/lib/notifications/templates';
import type { Branding } from '@/lib/programs/branding';

export type AutoSendControl =
  | { kind: 'toggle'; key: string; lockable?: boolean }
  | { kind: 'link'; href: string; linkLabel: string; status: string }
  | { kind: 'always' }
  | { kind: 'manual'; href: string; linkLabel: string };

export type AutoSendChannel = 'queue' | 'direct' | 'platform';

export interface AutoSendRow {
  id: string;
  stage: AutoSendStage;
  label: string;
  /** 발송 시점(트리거) */
  trigger: string;
  recipients: string;
  channel: AutoSendChannel;
  control: AutoSendControl;
  /** 실제 문구(예시 값으로 치환). null = 미리보기 없음 */
  preview: string | null;
  previewNote?: string;
}

export interface AutoSendCatalogInput {
  branding: Branding;
  /** NEXT_PUBLIC_APP_URL (끝 슬래시 제거) */
  appUrl: string;
  /** 멘토 리마인더 요약 — 페이지가 listReminderSettings 로 계산 */
  reminder: { status: string; preview: string };
}

const SAMPLE_MENTOR = '홍길동';
const SAMPLE_MENTEE = '김멘티';

/** 자동발송 탭 행 전체 — 단계 순서(AUTO_SEND_STAGES) → 단계 안에서는 정의 순서 */
export function buildAutoSendCatalog(input: AutoSendCatalogInput): AutoSendRow[] {
  const { branding, appUrl } = input;
  const footer = branding.smsFooter || null;
  const rows: AutoSendRow[] = [];

  // ---- 수동(참고) — 등록·로그인 안내
  rows.push({
    id: 'manual:login_guide',
    stage: 'register',
    label: '로그인 안내 문자',
    trigger: '회원 명단에서 회원을 골라 담당자가 직접 보냅니다. 등록만으로는 자동 발송되지 않습니다.',
    recipients: '선택한 회원',
    channel: 'direct',
    control: { kind: 'manual', href: '/nextlab/roster', linkLabel: '회원 명단' },
    preview: null,
  });

  // ---- 큐 알림 이벤트 (23종)
  for (const d of NOTIFICATION_EVENT_DEFS) {
    rows.push({
      id: `event:${d.key}`,
      stage: d.stage,
      label: d.label,
      trigger: d.desc,
      recipients: d.recipients,
      channel: 'queue',
      control: { kind: 'toggle', key: d.key, lockable: d.lockable },
      preview: renderNotificationText(d.key, branding, d.sampleExtra ?? null),
      previewNote: d.sampleExtra ? '뒤에 붙는 건별 문구는 예시입니다.' : undefined,
    });
  }

  // ---- 직발송 자동 문자 (행사별 on/off)
  for (const d of DIRECT_AUTO_SEND_DEFS) {
    let preview: string;
    if (d.key === 'auto_login_guide_on_matched') {
      preview = buildMatchedMentorLoginGuideText({ programName: branding.programName, mentorName: SAMPLE_MENTOR, email: 'mentor@example.com', appUrl, mustChangePassword: true, footer });
    } else if (d.key === 'survey_reminder_auto') {
      preview = buildSurveyAutoReminderText({ programName: branding.programName, menteeName: SAMPLE_MENTEE, appUrl, footer });
    } else {
      preview = buildRetentionNoticeText({ programName: branding.programName, expiry: '2031-12-31', expired: false, years: branding.retentionYears });
    }
    rows.push({
      id: `direct:${d.key}`,
      stage: d.stage,
      label: d.label,
      trigger: d.desc,
      recipients: d.recipients,
      channel: 'direct',
      control: { kind: 'toggle', key: d.key },
      preview,
      previewNote: '이름·주소 등은 예시 값입니다.',
    });
  }

  // ---- 만족도·조사 — 수동
  rows.push({
    id: 'manual:survey_campaign',
    stage: 'survey',
    label: '조사 초대·미참여 독려 / 만족도 미응답 일괄 독려',
    trigger: '조사 화면에서 담당자가 [초대]·[독려]를 눌러 보냅니다.',
    recipients: '조사 대상자·미응답 멘티',
    channel: 'direct',
    control: { kind: 'manual', href: '/nextlab/surveys', linkLabel: '조사' },
    preview: null,
  });

  // ---- 리마인더·지연
  rows.push({
    id: 'link:mentor_reminder',
    stage: 'reminder',
    label: '멘토 리마인더(주간 진행 독려)',
    trigger: '행사 공통·그룹별로 정한 요일·시각에 회차가 남은 멘티가 있는 멘토에게 (매시 30분마다 확인해 하루 한 번)',
    recipients: '멘토',
    channel: 'direct',
    control: { kind: 'link', href: '/admin/settings/sms?tab=reminder', linkLabel: '멘토 리마인더 탭에서 설정', status: input.reminder.status },
    preview: input.reminder.preview,
    previewNote: '행사 공통 문구 기준 예시입니다. 그룹별 문구는 멘토 리마인더 탭에서 확인하세요.',
  });
  rows.push({
    id: 'manual:delay_nudge',
    stage: 'reminder',
    label: '지연 독려 문자',
    trigger: '리포트 개요의 지연 케이스에서 담당자가 골라 보냅니다.',
    recipients: '멘토',
    channel: 'direct',
    control: { kind: 'manual', href: '/nextlab/reports', linkLabel: '리포트' },
    preview: null,
  });

  // ---- 시스템·보안 — 항상 발송
  rows.push(
    {
      id: 'always:login_otp',
      stage: 'system',
      label: '로그인 인증번호 (담당자 2단계 인증)',
      trigger: '발주처·운영사·플랫폼 관리자가 비밀번호로 로그인할 때 (\'이 기기 기억\'을 켠 기기는 30일 동안 생략)',
      recipients: '로그인한 담당자 본인',
      channel: 'platform',
      control: { kind: 'always' },
      preview: '[멘토링 운영관리 플랫폼] 로그인 인증번호 123456 (5분 내 입력, 본인이 아니면 무시하세요)',
      previewNote: '인증번호는 예시입니다.',
    },
    {
      id: 'always:password_reset',
      stage: 'system',
      label: '비밀번호 재설정 인증번호',
      trigger: '로그인 화면에서 본인이 비밀번호 재설정을 요청할 때',
      recipients: '요청한 본인',
      channel: 'platform',
      control: { kind: 'always' },
      preview: '[멘토링 플랫폼] 비밀번호 재설정 인증번호 123456 · 5분 내 입력하세요. 본인이 요청하지 않았다면 무시하세요.',
      previewNote: '인증번호는 예시입니다.',
    },
    {
      id: 'always:security_alert',
      stage: 'system',
      label: '보안 이상 징후 알림',
      trigger: '자동 해킹 도구의 접근·짧은 시간에 몰린 로그인 실패·자료 대량 내려받기·권한 없는 화면 접근 같은 위험 신호가 보일 때 (5분마다 확인, 같은 알림은 30분에 한 번)',
      recipients: '플랫폼 관리자·개인정보 보호책임자·운영 알림 번호',
      channel: 'platform',
      control: { kind: 'always' },
      preview: null,
      previewNote: '발견된 위험 신호의 종류·건수로 문구가 만들어집니다.',
    },
    {
      id: 'always:error_alert',
      stage: 'system',
      label: '화면 오류 알림',
      trigger: '사용자 화면에서 오류가 보고되면 (5분마다 확인, 같은 알림은 30분에 한 번)',
      recipients: '플랫폼 관리자·운영 알림 번호',
      channel: 'platform',
      control: { kind: 'always' },
      preview: null,
      previewNote: '오류가 난 화면·건수로 문구가 만들어집니다.',
    },
  );

  const order = new Map<string, number>(AUTO_SEND_STAGES.map((s, i) => [s.key, i]));
  // 안정 정렬 — 단계 순서만 맞추고 단계 안의 순서는 위에서 넣은 순서를 유지
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (order.get(a.r.stage) ?? 99) - (order.get(b.r.stage) ?? 99) || a.i - b.i)
    .map((x) => x.r);
}
