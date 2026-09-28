/**
 * 행사 브랜딩 — 발주처/용역사 기관명 등을 **한 곳에서** 읽는다 (docs/MODU-DESIGN.md §17).
 * 서버·클라이언트 공용 순수 함수. 조회는 `src/lib/programs/data.ts` 의 `getBranding()`.
 *
 * 문구에는 `{client}` `{operator}` `{program}` `{client_name}` `{operator_name}` 플레이스홀더만 쓰고
 * 기관명 리터럴은 코드에 두지 않는다 (scripts/check-brand-strings.sh 가 lint 단계에서 검사).
 */
import type { Tables } from '@/types/database';
import { ROLE_LABELS, type UserRole } from '@/lib/auth/roles';

export interface Branding {
  programId: string;
  programName: string;
  slug: string;
  clientName: string;
  clientShort: string;
  clientSealName: string;
  clientLogoPath: string | null;
  operatorName: string;
  operatorShort: string;
  operatorContact: string | null;
  appTitle: string;
  logoPath: string | null;
  smsFooter: string;
  emailSubjectPrefix: string;
  /** (P35-B) 개인정보 보존기간 — 사업 종료 후 N년. 처리방침·멘티 동의문·보존 만료 알림이 읽는다 (programs.retention_years, 기본 5) */
  retentionYears: number;
}

/** 보존기간 기본값(년) — 2026-09-28 사용자 결정 "사업 종료 후 5년". DB 기본값(0087)과 같다. */
export const DEFAULT_RETENTION_YEARS = 5;

/** 컨텍스트가 없을 때(허브·로그인) 쓰는 플랫폼 기본 브랜드 */
export const PLATFORM_BRANDING: Branding = {
  programId: '',
  programName: '',
  slug: '',
  clientName: '발주처',
  clientShort: '발주처',
  clientSealName: '발주처',
  clientLogoPath: null,
  operatorName: '운영사',
  operatorShort: '운영사',
  operatorContact: null,
  appTitle: '멘토링 운영관리 플랫폼',
  logoPath: null,
  smsFooter: '',
  emailSubjectPrefix: '',
  retentionYears: DEFAULT_RETENTION_YEARS,
};

export function brandingFromProgram(p: Tables<'programs'>): Branding {
  return {
    programId: p.id,
    programName: p.name,
    slug: p.slug,
    clientName: p.client_name,
    clientShort: p.client_short?.trim() || p.client_name,
    clientSealName: p.client_seal_name?.trim() || p.client_name,
    clientLogoPath: p.client_logo_path,
    operatorName: p.operator_name,
    operatorShort: p.operator_short?.trim() || p.operator_name,
    operatorContact: p.operator_contact,
    appTitle: p.app_title?.trim() || `${p.name} 운영관리`,
    logoPath: p.logo_path,
    smsFooter: p.sms_footer ?? '',
    emailSubjectPrefix: p.email_subject_prefix ?? `[${p.name}]`,
    retentionYears: Number.isFinite(p.retention_years) && p.retention_years > 0 ? p.retention_years : DEFAULT_RETENTION_YEARS,
  };
}

/** 역할 라벨: 발주처/운영사는 행사 약칭, 멘토/멘티는 고정 */
export function roleLabel(role: UserRole, b: Branding = PLATFORM_BRANDING): string {
  if (role === 'institution') return b.clientShort;
  if (role === 'nextlab') return b.operatorShort;
  return ROLE_LABELS[role];
}

/** `{client}` 등 플레이스홀더 치환 + 추가 변수 */
export function fmt(
  template: string,
  b: Branding = PLATFORM_BRANDING,
  vars: Record<string, string | number | null | undefined> = {},
): string {
  const base: Record<string, string> = {
    client: b.clientShort,
    client_name: b.clientName,
    client_seal: b.clientSealName,
    operator: b.operatorShort,
    operator_name: b.operatorName,
    program: b.programName,
    app: b.appTitle,
  };
  return template.replace(/\{([a-z_]+)\}/g, (m, key: string) => {
    if (key in vars) {
      const v = vars[key];
      return v == null ? '' : String(v);
    }
    return key in base ? base[key]! : m;
  });
}
