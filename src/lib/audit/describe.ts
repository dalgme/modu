/**
 * 감사로그 액션 코드 → 사람이 읽는 설명 (클라이언트·서버 공용, 순수 함수).
 * 기본 표에는 이 설명을 보여주고, 원본(액션 코드·대상·메타데이터)은 "소스" 팝업에서 본다.
 */
export interface AuditLike {
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: unknown;
  actorName: string | null;
  programName?: string | null;
  onBehalfOfName?: string | null;
}

export interface AuditDescription {
  /** 한 줄 설명 (주어 = 수행자) */
  text: string;
  /** 분류 라벨 (배지) */
  category: string;
}

const ROLE: Record<string, string> = { institution: '발주처', nextlab: '운영사', mentor: '멘토', mentee: '멘티' };
const GRADE: Record<string, string> = { pl: '메인 담당(PL)', pm: 'PM', deputy_pm: '부PM', observer: '옵저버' };
const SETTING_KEY: Record<string, string> = {
  program: '행사 기본 정보',
  support_type: '사업그룹',
  support_type_document: '그룹 필수서류',
  consulting_rate: '컨설팅 단가',
  operating_limit: '운영 한도',
  withholding: '원천징수 방식',
  closure_policy: '종결 게이트 정책',
  round_report_policy: '보고서 서명 정책',
  report_template: '보고서 양식',
  survey_template: '만족도 양식',
  tag: '키워드 사전',
  staff_permissions: '담당 등급별 권한',
};

function meta(m: unknown): Record<string, unknown> {
  return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const won = (n: number | null) => (n === null ? '' : `${n.toLocaleString('ko-KR')}원`);

/** 액션 코드 사전 — 접두(prefix) 순으로 매칭한다. 새 액션을 추가하면 여기에 한 줄 보탠다. */
const RULES: { test: (a: string) => boolean; category: string; text: (a: string, m: Record<string, unknown>, l: AuditLike) => string }[] = [
  { test: (a) => a === 'account.bootstrap', category: '계정', text: (_a, m) => `플랫폼 통합관리자 계정을 최초 생성했습니다 (${str(m.email) ?? ''})` },
  { test: (a) => a === 'account.create', category: '계정', text: (_a, m) => `${ROLE[str(m.role) ?? ''] ?? '회원'} 계정을 발급했습니다 (${str(m.email) ?? ''})` },
  { test: (a) => a === 'mentee.invite', category: '계정', text: (_a, m) => `멘티 계정을 발급하고 케이스에 연결했습니다 (${str(m.email) ?? ''})` },
  { test: (a) => a === 'account.delete', category: '계정', text: (_a, m) => `회원 계정을 삭제했습니다 (${str(m.email) ?? str(m.name) ?? ''})` },
  { test: (a) => a === 'account.activate', category: '계정', text: () => '회원 계정을 활성화했습니다' },
  { test: (a) => a === 'account.deactivate', category: '계정', text: () => '회원 계정을 비활성화했습니다 (로그인 차단)' },
  { test: (a) => a === 'account.reset_password', category: '계정', text: () => '회원의 임시 비밀번호를 재발급했습니다' },
  { test: (a) => a === 'account.password_reset_sms', category: '계정', text: () => '회원이 휴대폰 문자 인증으로 비밀번호를 재설정했습니다' },
  { test: (a) => a === 'platform.account.reset_password', category: '플랫폼', text: () => '플랫폼 콘솔에서 임시 비밀번호를 재발급했습니다' },
  { test: (a) => a === 'platform.account.activate', category: '플랫폼', text: () => '플랫폼 콘솔에서 계정을 활성화했습니다' },
  { test: (a) => a === 'platform.account.deactivate', category: '플랫폼', text: () => '플랫폼 콘솔에서 계정을 비활성화했습니다' },
  { test: (a) => a === 'platform.membership.add', category: '플랫폼', text: (_a, m) => `계정을 행사 '${str(m.program) ?? ''}'에 ${ROLE[str(m.role) ?? ''] ?? ''} 역할로 소속시켰습니다` },
  { test: (a) => a === 'platform.membership.remove', category: '플랫폼', text: (_a, m) => `계정의 행사 '${str(m.program) ?? ''}' 소속을 해제했습니다` },
  { test: (a) => a === 'platform.admin_granted', category: '플랫폼', text: () => '플랫폼 부관리자를 지정했습니다' },
  { test: (a) => a === 'platform.admin_revoked', category: '플랫폼', text: () => '플랫폼 부관리자 권한을 해제했습니다' },
  { test: (a) => a === 'platform.admin_created', category: '플랫폼', text: (_a, m) => `새 플랫폼 부관리자 계정을 발급했습니다 (${str(m.email) ?? ''})` },
  { test: (a) => a === 'program.create', category: '행사', text: (_a, m) => `행사 '${str(m.name) ?? ''}'를 개설했습니다${m.clone_from ? ' (기존 행사 설정 복제)' : ''}${m.first_account ? ' · 첫 운영사 계정 발급' : ''}` },
  { test: (a) => a === 'program.update', category: '행사', text: () => '행사 개설정보(행사명·기관명·기간·기본 회차 등)를 수정했습니다' },
  { test: (a) => a === 'program.status', category: '행사', text: (_a, m) => (str(m.status) === 'ended' ? '행사를 종료 상태로 바꿨습니다' : '행사를 다시 진행 중으로 바꿨습니다') },
  { test: (a) => a === 'program.staff_added', category: '행사', text: (_a, m) => `행사에 ${ROLE[str(m.role) ?? ''] ?? '스태프'} 담당자를 추가했습니다${m.created ? ' (새 계정 발급)' : ''}` },
  { test: (a) => a === 'membership.add', category: '회원', text: (_a, m) => `기존 계정을 이 행사에 ${ROLE[str(m.role) ?? ''] ?? ''} 역할로 추가했습니다` },
  { test: (a) => a === 'membership.update', category: '회원', text: (_a, m) => `이 행사 소속을 ${ROLE[str(m.role) ?? ''] ?? ''} 역할로 다시 활성화했습니다` },
  { test: (a) => a === 'membership.role', category: '회원', text: (_a, m) => `이 행사에서의 역할을 ${ROLE[str(m.previous_role) ?? ''] ?? '?'} → ${ROLE[str(m.role) ?? ''] ?? '?'} 로 바꿨습니다` },
  { test: (a) => a === 'membership.grade', category: '회원', text: (_a, m) => `운영사 담당 등급을 ${GRADE[str(m.grade) ?? ''] ?? '메인 담당(PL)'} 로 지정했습니다${str(m.duty) ? ` · 담당: ${str(m.duty)}` : ''}` },
  { test: (a) => a === 'membership.profile', category: '회원', text: (_a, m) => `담당자 정보를 수정했습니다${str(m.position) ? ` (직위 ${str(m.position)})` : ''}` },
  { test: (a) => a === 'membership.remove', category: '회원', text: () => '이 행사 소속을 해제했습니다 (계정·다른 행사 활동 유지)' },
  { test: (a) => a === 'case.create', category: '케이스', text: (_a, m) => `멘티(케이스)를 등록했습니다${m.predecessor_case_id ? ' (이전 단계에서 승계)' : ''}` },
  { test: (a) => a === 'case.mentee_linked_existing', category: '케이스', text: (_a, m) => `이메일·휴대폰이 일치하는 기존 계정을 멘티로 연결했습니다 (${str(m.matched_by) === 'email' ? '이메일' : '휴대폰'} 일치)` },
  { test: (a) => a === 'case.succession', category: '케이스', text: () => '다음 단계 사업그룹으로 케이스를 승계 개설했습니다' },
  { test: (a) => a === 'case.assign_mentor', category: '배정', text: () => '멘토를 배정했습니다' },
  { test: (a) => a === 'case.reassign_mentor', category: '배정', text: (_a, m) => `멘토를 교체했습니다${str(m.reason) ? ` — ${str(m.reason)}` : ''}` },
  { test: (a) => a === 'case.recall_mentor', category: '배정', text: () => '멘토 배정을 회수했습니다' },
  { test: (a) => a === 'match.recommend', category: '매칭', text: (_a, m) => `AI 멘토 매칭 추천을 생성했습니다${m.used_model ? ' (모델 근거 포함)' : ' (객관 점수만)'}` },
  { test: (a) => a === 'match.adoption', category: '매칭', text: (_a, m) => (num(m.recommended_rank) ? `추천 ${num(m.recommended_rank)}순위 멘토를 채택해 배정했습니다` : '추천과 무관하게 멘토를 배정했습니다') },
  { test: (a) => a === 'round.create', category: '회차', text: (_a, m) => `컨설팅 회차를 등록했습니다${num(m.round_no) ? ` (${num(m.round_no)}회차)` : ''}${str(m.mode) ? ` · ${str(m.mode) === 'online' ? '온라인' : '오프라인'}` : ''}` },
  { test: (a) => a === 'round.update', category: '회차', text: () => '컨설팅 회차 내용을 수정했습니다' },
  { test: (a) => a === 'round.delete', category: '회차', text: () => '컨설팅 회차를 삭제했습니다' },
  { test: (a) => a === 'round.mentee_signed', category: '회차', text: () => '멘티가 회차 보고서를 확인 서명했습니다' },
  { test: (a) => a === 'round.report_render_failed', category: '회차', text: () => '회차 보고서 PDF 생성에 실패했습니다 (회차 저장은 유지)' },
  { test: (a) => a === 'round.extension_requested', category: '요청', text: (_a, m) => `추가 회차 ${num(m.extra_rounds) ?? 1}회를 요청했습니다` },
  { test: (a) => a.startsWith('round.extension_'), category: '요청', text: (a) => (a.endsWith('approved') ? '추가 회차 요청을 승인했습니다' : '추가 회차 요청을 반려했습니다') },
  { test: (a) => a === 'case.closure_requested', category: '종결', text: () => '관찰의견서를 제출하고 종결을 요청했습니다' },
  { test: (a) => a === 'case.review_approve', category: '검수', text: () => '종결 검수를 승인하고 정산을 확정했습니다' },
  { test: (a) => a === 'case.review_revision', category: '검수', text: (_a, m) => `종결 검수에서 보완을 요청했습니다${str(m.comment) ? ` — ${str(m.comment)}` : ''}` },
  { test: (a) => a === 'case.withdrawn', category: '종결', text: (_a, m) => `멘티를 중도 종료 처리했습니다${str(m.reason) ? ` — ${str(m.reason)}` : ''}` },
  { test: (a) => a === 'mentor.withdrawal_requested', category: '요청', text: () => '멘토가 중도 종료를 요청했습니다' },
  { test: (a) => a === 'mentor.withdrawal_approved', category: '요청', text: () => '멘토 중도 종료 요청을 승인했습니다 (재배정 대기)' },
  { test: (a) => a === 'mentor.withdrawal_rejected', category: '요청', text: () => '멘토 중도 종료 요청을 반려했습니다' },
  { test: (a) => a === 'mentor.force_ended', category: '배정', text: () => '운영사 결정으로 멘토 배정을 강제 종료했습니다 (사유는 운영사·발주처만 열람)' },
  { test: (a) => a === 'mentor.change_requested', category: '요청', text: () => '멘티가 멘토 변경을 요청했습니다' },
  { test: (a) => a.startsWith('mentor.change_'), category: '요청', text: (a) => (a.endsWith('accepted') ? '멘토 변경 요청을 수락해 교체했습니다' : '멘토 변경 요청을 반려했습니다') },
  { test: (a) => a === 'mentor.payment_doc_check', category: '멘토', text: () => '멘토 지급서류(이력서·통장사본·신분증) 수령 여부를 기록했습니다 (비밀번호 재인증)' },
  { test: (a) => a === 'mentor.group_review', category: '멘토', text: () => '그룹 안에서 멘토 평가·메모를 남겼습니다' },
  { test: (a) => a === 'mentor.signature_saved', category: '멘토', text: () => '멘토가 서명 이미지를 등록했습니다' },
  { test: (a) => a.startsWith('settlement.confirmed'), category: '정산', text: (a, m) => (a.endsWith('statement') ? (str(m.status) === 'failed' ? '정산서 PDF 생성에 실패했습니다' : '정산서 PDF를 생성했습니다') : `정산을 확정 저장했습니다${num(m.net) ? ` (실지급 ${won(num(m.net))})` : ''}`) },
  { test: (a) => a === 'settlement.canceled', category: '정산', text: (_a, m) => `확정 정산을 취소했습니다${str(m.reason) ? ` — ${str(m.reason)}` : ''}` },
  { test: (a) => a === 'batch.created', category: '품의', text: () => '지급 품의 묶음을 만들었습니다' },
  { test: (a) => a === 'batch.submitted', category: '품의', text: () => '지급 품의를 발주처에 제출했습니다' },
  { test: (a) => a === 'batch.unsubmitted', category: '품의', text: () => '지급 품의 제출을 철회했습니다' },
  { test: (a) => a === 'batch.confirmed', category: '품의', text: () => '발주처가 정산을 확인했습니다 (케이스 종결 확정)' },
  { test: (a) => a === 'batch.paid', category: '품의', text: () => '지급 완료로 표시했습니다' },
  { test: (a) => a === 'batch.deleted', category: '품의', text: () => '지급 품의 묶음을 삭제했습니다' },
  { test: (a) => a === 'document.attach', category: '서류', text: (_a, m) => `서류를 첨부했습니다${str(m.doc_key) ? ` (${str(m.doc_key)})` : ''}` },
  { test: (a) => a === 'document.delete', category: '서류', text: () => '서류를 삭제했습니다' },
  { test: (a) => a === 'document.visibility', category: '서류', text: (_a, m) => (m.mentor_visible ? '서류를 멘토에게 공개로 바꿨습니다' : '서류를 멘토 비공개로 바꿨습니다') },
  { test: (a) => a === 'survey.submitted', category: '만족도', text: () => '멘티가 만족도 조사에 응답했습니다' },
  { test: (a) => a === 'settings.update', category: '설정', text: (_a, m) => `운영 설정을 변경했습니다 — ${SETTING_KEY[str(m.key) ?? ''] ?? str(m.key) ?? ''}` },
  { test: (a) => a.startsWith('sms.api'), category: '문자', text: (a) => (a.includes('test') ? '행사별 문자 API로 테스트 발송을 했습니다' : a.includes('delete') || a.includes('revoke') ? '행사별 문자 API 등록을 해제했습니다' : '행사별 문자 API 자격증명을 등록·갱신했습니다 (비밀번호 재인증)') },
  { test: (a) => a === 'sms.bulk_send', category: '문자', text: (_a, m) => `문자를 일괄 발송했습니다${num(m.count) ? ` (${num(m.count)}건)` : ''}` },
  { test: (a) => a === 'sms.schedule', category: '문자', text: () => '문자 예약 발송을 등록했습니다' },
  { test: (a) => a === 'sms.mentor_weekly_reminder', category: '문자', text: () => '멘토 주간 안내 문자를 발송했습니다' },
  { test: (a) => a === 'impersonation.start', category: '대행', text: (_a, m) => `${str(m.target_name) ?? '회원'} 님 화면 대행을 시작했습니다` },
  { test: (a) => a === 'impersonation.stop', category: '대행', text: () => '화면 대행을 종료했습니다' },
  { test: (a) => a === 'inquiry.create', category: '문의', text: () => '문의를 등록했습니다' },
  { test: (a) => a === 'report.snapshot', category: '리포트', text: (_a, m) => `종합결과리포트를 생성했습니다${str(m.title) ? ` — ${str(m.title)}` : ''}` },
  { test: (a) => a === 'report.export', category: '리포트', text: (_a, m) => `종합결과리포트를 ${String(str(m.format) ?? '').toUpperCase()} 로 내보냈습니다` },
];

export function describeAudit(l: AuditLike): AuditDescription {
  const m = meta(l.metadata);
  const rule = RULES.find((r) => r.test(l.action));
  if (rule) return { text: rule.text(l.action, m, l), category: rule.category };
  const [head] = l.action.split('.');
  return { text: `${l.action} 작업을 수행했습니다`, category: head ?? '기타' };
}

/** 소스 팝업용: 사람이 보기 좋게 정리한 JSON 문자열 */
export function auditSource(l: AuditLike & { id?: string; created_at?: string; program_id?: string | null; actor_id?: string | null }): string {
  return JSON.stringify(
    {
      id: l.id,
      created_at: l.created_at,
      action: l.action,
      program_id: l.program_id ?? null,
      actor_id: l.actor_id ?? null,
      entity_type: l.entity_type,
      entity_id: l.entity_id,
      metadata: l.metadata ?? null,
    },
    null,
    2,
  );
}
