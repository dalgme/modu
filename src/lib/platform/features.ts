/**
 * 행사별 플랫폼 기능 플래그 (P15) — `programs.features` jsonb.
 * 플랫폼 통합관리자만 켜고 끈다(/platform/programs/[id]). 키가 없거나 false = 비활성.
 * 비활성 기능은 운영사 설정·해당 역할 화면에 노출되지 않고 서버 액션도 차단된다.
 */

export const FEATURE_KEYS = ['mentor_forms', 'mentor_doc_upload'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_DEFS: Record<FeatureKey, { label: string; description: string }> = {
  mentor_forms: {
    label: '책임멘토 위촉 서식',
    description:
      '위촉 동의서·개인정보 동의서·서약서·사전 확인서 제출 기능 (운영사 설정 [위촉 서식] 탭, 멘토 [위촉 서류] 화면, 멘토 명단 집계). 주민등록번호 등 개인정보 보관 보완이 끝날 때까지 기본 비활성.',
  },
  mentor_doc_upload: {
    label: '멘토 지급서류 플랫폼 업로드',
    description:
      '멘토가 내 프로필에서 이력서·통장사본·신분증사본 파일을 직접 올리는 기능. 기본 비활성 — 지급서류는 이메일 등으로 따로 받고 멘토 명단의 -/X/O 상태버튼으로만 관리한다. 켜면 멘토 화면에 업로드 패널과 명단에 제출파일 링크가 나타난다.',
  },
};

/** programs.features jsonb 에서 기능 활성 여부 판정 — 키 없음/false = 비활성 */
export function featureEnabled(features: unknown, key: FeatureKey): boolean {
  if (!features || typeof features !== 'object') return false;
  return (features as Record<string, unknown>)[key] === true;
}
