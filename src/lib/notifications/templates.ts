/** trigger_event → 알림 템플릿 코드·본문 매핑 (설계문서 6.2 발송 시점) */
export const NOTIFICATION_TEMPLATES: Record<string, { code: string; text: string }> = {
  mentor_assigned: {
    code: 'MENTOR_ASSIGNED',
    text: '멘토가 배정되었습니다. 담당 멘토의 연락을 기다려 주세요.',
  },
  log_completed: { code: 'LOG_COMPLETED', text: '멘토링 일지가 작성되었습니다.' },
  contractor_registered: { code: 'CONTRACTOR_REGISTERED', text: '공사업체 등록이 완료되었습니다.' },
  application_drafted: {
    code: 'APPLICATION_DRAFTED',
    text: '지원신청서 검수 요청이 도착했습니다.',
  },
  under_review: {
    code: 'UNDER_REVIEW',
    text: '지원신청서 검수 요청이 도착했습니다. 검수를 진행해 주세요.',
  },
  revision_requested: { code: 'REVISION_REQUESTED', text: '지원신청서 보완요청이 있습니다.' },
  reviewed: { code: 'REVIEWED', text: '지원신청서 승인 대기 건이 있습니다.' },
  approved: { code: 'APPROVED', text: '지원신청이 승인되었습니다.' },
  rejected: { code: 'REJECTED', text: '지원신청이 반려되었습니다. 사유를 확인해 주세요.' },
  payment_approved: { code: 'PAYMENT_APPROVED', text: '지급이 승인되었습니다.' },
  approval_overdue: {
    code: 'APPROVAL_OVERDUE',
    text: '승인 대기 3일 초과 건이 있습니다. 확인 부탁드립니다.',
  },
};

export function templateFor(triggerEvent: string): { code: string; text: string } {
  return NOTIFICATION_TEMPLATES[triggerEvent] ?? { code: 'GENERIC', text: '알림이 있습니다.' };
}
