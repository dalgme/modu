import type { Enums } from '@/types/database';

export type UserRole = Enums<'user_role'>;

/**
 * 역할 기본 라벨 — **기관명 리터럴을 쓰지 않는다**(docs/MODU-DESIGN.md §17).
 * 행사 컨텍스트가 있으면 `roleLabel(role, branding)` 이 발주처/용역사 약칭으로 바꿔 보여준다.
 * 이 상수는 컨텍스트 밖(허브·로그인·회원관리 필터)에서만 직접 쓴다.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  institution: '발주처',
  nextlab: '운영사',
  mentor: '멘토',
  mentee: '멘티',
};

/** 역할별 로그인 후 홈 경로 (행사 컨텍스트가 정해진 뒤) */
export function roleHome(role: UserRole): string {
  switch (role) {
    case 'institution':
      return '/institution/dashboard';
    case 'nextlab':
      return '/nextlab/dashboard';
    case 'mentor':
      return '/mentor/dashboard';
    case 'mentee':
      return '/mentee/dashboard';
  }
}

/** 발주처·운영사(운영 관리자) 여부 */
export function isStaffRole(role: UserRole): boolean {
  return role === 'institution' || role === 'nextlab';
}
