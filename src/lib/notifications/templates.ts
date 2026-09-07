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
  batch_submitted: {
    code: 'BATCH_SUBMITTED',
    text: '[{program}] 지급 품의가 제출되었습니다. 정산 확인을 진행해 주세요.',
  },
  case_closed: { code: 'CASE_CLOSED', text: '[{program}] 케이스가 종결되었습니다.' },
  case_withdrawn: { code: 'CASE_WITHDRAWN', text: '[{program}] 케이스가 중도 종료되었습니다.' },
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
