/**
 * 역할별로 여는 화면 목록 (P34-A). 내비 컴포넌트·탭 상수에서 추출했다 — 화면을 추가하면 여기도 추가한다.
 *  - 운영사: src/components/nextlab/nextlab-nav.tsx · nav/staff-mobile-tabs.tsx · 설정/명단/리포트/게시판/검수/정산/문자 탭
 *  - 발주처: src/components/nav/institution-nav.tsx · 정산 미니탭 · 리포트 탭
 *  - 멘토:   src/components/mentor/mentor-nav.tsx
 *  - 멘티:   src/components/mentee/mentee-nav.tsx
 * `{caseId}` 는 시드 케이스 id(또는 목록 링크에서 찾은 id)로 치환된다.
 */

export const REPORT_TAB_KEYS = ['overview', 'trend', 'cases', 'mentors', 'groups', 'settlement', 'survey'] as const;
export const SETTINGS_TAB_KEYS = ['program', 'groups', 'rates', 'withholding', 'budget', 'matching', 'gates', 'reports', 'survey', 'mentor-docs', 'notifications', 'tags', 'permissions', 'succession', 'audit'] as const;
export const ROSTER_TAB_KEYS = ['mentee', 'mentor', 'mentee-match', 'mentor-match', 'institution', 'nextlab', 'register'] as const;
export const BOARD_TAB_KEYS = ['requests', 'all', 'inquiries', 'qna', 'messages', 'faq'] as const;
export const REVIEW_TAB_KEYS = ['pending', 'revision', 'mentor-input'] as const;
export const SETTLEMENT_TAB_KEYS = ['pending', 'all', 'tax'] as const;
export const SMS_TAB_KEYS = ['send', 'reminder', 'scheduled', 'history'] as const;

const withTabs = (base: string, keys: readonly string[]) => keys.map((k) => `${base}?tab=${k}`);

/** 운영사(nextlab) — 내비 9개 + 탭 전개 + 케이스 상세 */
export const NEXTLAB_PAGES: readonly string[] = [
  '/hub?pick=1',
  '/nextlab/dashboard',
  '/nextlab/reports',
  ...withTabs('/nextlab/reports', REPORT_TAB_KEYS),
  '/nextlab/reports/summary',
  '/nextlab/review',
  ...withTabs('/nextlab/review', REVIEW_TAB_KEYS),
  '/nextlab/roster',
  ...withTabs('/nextlab/roster', ROSTER_TAB_KEYS),
  '/nextlab/board',
  ...withTabs('/nextlab/board', BOARD_TAB_KEYS),
  '/nextlab/settlements',
  ...withTabs('/nextlab/settlements', SETTLEMENT_TAB_KEYS),
  '/nextlab/surveys',
  '/nextlab/settings',
  ...withTabs('/nextlab/settings', SETTINGS_TAB_KEYS),
  '/nextlab/settings/sms-api',
  '/admin/settings/sms',
  ...withTabs('/admin/settings/sms', SMS_TAB_KEYS),
  '/nextlab/cases/new',
  '/nextlab/cases/{caseId}',
  '/nextlab/install',
];

/** 발주처(institution) — 내비 8개 + 정산 미니탭 + 리포트 탭 + 케이스 상세 */
export const INSTITUTION_PAGES: readonly string[] = [
  '/hub?pick=1',
  '/institution/dashboard',
  '/institution/reports',
  ...withTabs('/institution/reports', REPORT_TAB_KEYS),
  '/institution/reports/summary',
  '/institution/settlements',
  '/institution/settlements?tab=forecast',
  '/institution/mentors',
  '/institution/requests',
  '/institution/mentee-board',
  '/institution/mentor-board',
  '/admin/settings/sms',
  '/institution/guide',
  '/institution/install',
  '/institution/cases/{caseId}',
];

/** 멘토(mentor) — 내비 8개 + 메시지 탭 + 케이스 상세 */
export const MENTOR_PAGES: readonly string[] = [
  '/mentor/dashboard',
  '/mentor/schedule',
  '/mentor/settlements',
  '/mentor/profile',
  '/mentor/signature',
  '/mentor/qna',
  '/mentor/qna?tab=messages',
  '/mentor/guide',
  '/mentor/install',
  '/mentor/cases/{caseId}',
];

/** 멘티(mentee) — 내비 6개 + 메시지 탭 + 동의 화면(동의 완료 계정은 통과·리다이렉트) */
export const MENTEE_PAGES: readonly string[] = [
  '/mentee/dashboard',
  '/mentee/schedule',
  '/mentee/rounds',
  '/mentee/survey',
  '/mentee/documents',
  '/mentee/inquiries',
  '/mentee/inquiries?tab=messages',
  '/mentee/consent',
];

/** 로그인 없이 열리는 화면 */
export const PUBLIC_PAGES: readonly string[] = ['/login', '/reset-password', '/register/operator', '/privacy-policy', '/terms'];

/** `{caseId}` 치환 — id 를 못 찾았으면 그 경로는 null(스킵) */
export function resolvePath(path: string, caseId: string | null): string | null {
  if (!path.includes('{caseId}')) return path;
  return caseId ? path.replace('{caseId}', caseId) : null;
}
