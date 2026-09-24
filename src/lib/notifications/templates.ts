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

/** 알림 이벤트 정의 (P32) — 운영 설정 [알림] 탭의 on/off 목록. 키 = NOTIFICATION_TEMPLATES 의 trigger_event 전부. */
export interface NotificationEventDef {
  key: string;
  label: string;
  /** 주 수신자(설정 화면의 묶음). 둘 이상이면 desc 에 병기 */
  audience: '멘토' | '멘티' | '운영사' | '발주처';
  desc: string;
  /** 정산·품의 게이트 알림 — 끄면 지급 흐름이 멈출 수 있어 화면에서 잠그고(항상 켬) 액션도 false 저장을 거부한다 */
  lockable?: boolean;
}

export const NOTIFICATION_EVENT_DEFS: NotificationEventDef[] = [
  // ---- 멘티
  { key: 'mentor_assigned', label: '멘토 배정', audience: '멘티', desc: '멘토 배정·재배정 시 (멘토·멘티 모두에게)' },
  { key: 'round_registered', label: '회차 보고서 확인·서명 안내', audience: '멘티', desc: '보고서(2단계) 등록 시 — 멘티 확인 서명 정책이 켜진 그룹만' },
  { key: 'mentor_change_decided', label: '멘토 변경 요청 처리 결과', audience: '멘티', desc: '멘티의 멘토 변경 요청을 수락·반려했을 때' },
  { key: 'mentor_ended', label: '담당 멘토 종료(재배정 대기)', audience: '멘티', desc: '멘토 중도 종료 승인·운영사 강제 종료·중도 종료 복귀 시 (멘토·멘티 모두에게)' },
  { key: 'survey_opened', label: '만족도 조사 안내', audience: '멘티', desc: '종결 요청 시 활성 양식이 있고 미응답이면' },
  { key: 'survey_reminder', label: '만족도 조사 독려', audience: '멘티', desc: '발주처 정산 확인(종결) 시 미응답 멘티에게' },
  { key: 'case_closed', label: '케이스 종결', audience: '멘티', desc: '발주처 정산 확인으로 종결 확정 시 (멘토·멘티 모두에게)' },
  { key: 'case_withdrawn', label: '케이스 중도 종료', audience: '멘티', desc: '중도 종료 시 (멘토·멘티 모두에게, 발주처가 종료하면 운영사에도)' },
  // ---- 멘토
  { key: 'round_signed', label: '멘티 회차 서명 완료', audience: '멘토', desc: '멘티가 회차 보고서에 서명했을 때 (현장 서명 제외)' },
  { key: 'extension_decided', label: '추가 회차 요청 처리 결과', audience: '멘토', desc: '추가 회차 요청을 승인·반려했을 때' },
  { key: 'revision_requested', label: '검수 보완 요청', audience: '멘토', desc: '운영사가 종결 검수에서 보완을 요청했을 때' },
  { key: 'settlement_confirmed', label: '정산 확정', audience: '멘토', desc: '검수 승인·부분 정산으로 정산이 확정됐을 때' },
  { key: 'settlement_canceled', label: '정산 취소', audience: '멘토', desc: '확정됐던 정산을 취소했을 때' },
  { key: 'settlement_paid', label: '정산금 지급 완료', audience: '멘토', desc: '품의 지급 완료 표시 시 멘토별 실지급액 통보' },
  // ---- 운영사
  { key: 'closure_requested', label: '종결 요청 접수', audience: '운영사', desc: '멘토가 관찰의견서를 제출하고 종결을 요청했을 때 (검수 권한 담당자)' },
  { key: 'extension_requested', label: '추가 회차 요청 접수', audience: '운영사', desc: '멘토의 추가 회차 요청 (검수 권한 담당자)' },
  { key: 'mentor_change_requested', label: '멘토 변경 요청 접수', audience: '운영사', desc: '멘티의 멘토 변경 요청 (검수 권한 담당자)' },
  { key: 'mentor_withdrawal_requested', label: '멘토 중도 종료 요청 접수', audience: '운영사', desc: '멘토의 자진 중도 종료 요청 (검수 권한 담당자)' },
  { key: 'closure_overdue', label: '검수 지연 알림', audience: '운영사', desc: '종결 요청 후 3일 지난 검수 대기 건 (Cron · 검수 권한 담당자, 7일 중복 방지)' },
  { key: 'batch_returned', label: '품의 반려 통보', audience: '운영사', desc: '발주처가 지급 품의를 반려했을 때 (품의 권한 담당자)' },
  { key: 'batch_confirmed', label: '품의 정산 확인 통보', audience: '운영사', desc: '발주처가 지급 품의의 정산을 확인했을 때 (품의 권한 담당자)' },
  // ---- 발주처
  { key: 'batch_submitted', label: '지급 품의 제출', audience: '발주처', desc: '운영사가 지급 품의를 제출했을 때' },
  { key: 'batch_unsubmitted', label: '지급 품의 철회', audience: '발주처', desc: '운영사가 제출했던 품의를 철회했을 때' },
];

/**
 * 행사 설정(programs.notification_settings)에서 이벤트 발송 여부 해석 (P32).
 * 키 없음 = 발송, 정확히 `false` 만 미발송. 잘못된 값(비객체)은 전부 발송.
 */
export function notificationEnabled(settings: unknown, event: string): boolean {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return true;
  return (settings as Record<string, unknown>)[event] !== false;
}
