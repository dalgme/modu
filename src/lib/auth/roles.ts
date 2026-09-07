import type { Enums } from '@/types/database';

export type UserRole = Enums<'user_role'>;

export const ROLE_LABELS: Record<UserRole, string> = {
  institution: '진흥원',
  nextlab: '넥스트랩',
  mentor: '멘토',
  mentee: '멘티',
};

/** 역할별 로그인 후 홈 경로 */
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

/** 진흥원·넥스트랩(운영 관리자) 여부 */
export function isStaffRole(role: UserRole): boolean {
  return role === 'institution' || role === 'nextlab';
}
