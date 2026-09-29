/**
 * 멘티 사업계획서·참고파일 공용 상수 (2026-09-30) — 서버·클라이언트 중립 파일.
 * 운영사가 [파일 관리 > 멘티 사업계획서]에서 라운드별로 일괄 업로드하면 파일명 맨 앞의 멘티명으로 케이스에 귀속된다.
 * 멘토는 웹 미리보기만(인쇄·다운로드 차단) — 행사 설정 file_policy.business_plan_download=true 일 때만 내려받기 허용.
 */
export const BUSINESS_PLAN_DOC_KEY = 'business_plan';
export const BUSINESS_REF_DOC_KEY = 'business_ref';
export const BUSINESS_DOC_KEYS = [BUSINESS_PLAN_DOC_KEY, BUSINESS_REF_DOC_KEY] as const;
export type BusinessDocKey = (typeof BUSINESS_DOC_KEYS)[number];

export const BUSINESS_DOC_LABELS: Record<BusinessDocKey, string> = {
  business_plan: '사업계획서',
  business_ref: '참고파일',
};

export function isBusinessDocKey(key: string | null | undefined): key is BusinessDocKey {
  return key === BUSINESS_PLAN_DOC_KEY || key === BUSINESS_REF_DOC_KEY;
}

/** programs.file_policy 해석 — 키가 없으면 기본값(다운로드 비허용) */
export interface FilePolicy {
  businessPlanDownload: boolean;
}

export function parseFilePolicy(raw: unknown): FilePolicy {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { businessPlanDownload: o.business_plan_download === true };
}
