/** 회원 등록 자격 메뉴 — 서버(roster 페이지)·클라이언트(RegisterPanel) 공용 상수. 'use client' 모듈에 두면 서버에서 find() 호출이 불가하다. */
export const REG_ROLES = [
  { key: 'mentee', label: '멘티' },
  { key: 'mentor', label: '멘토' },
  { key: 'nextlab', label: '운영사' },
  { key: 'institution', label: '발주처' },
] as const;
export type RegKey = (typeof REG_ROLES)[number]['key'];
