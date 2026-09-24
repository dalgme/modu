/**
 * 운영사(용역사) 담당 등급과 권한 (2026-09-08 요건).
 *  - 등급: pl(메인 담당자) · pm · deputy_pm(부PM) · observer(옵저버 — 현황 확인·자문, 열람 전용)
 *  - 권한(capability)은 코드 기본표(DEFAULT_GRANTS)를 쓰고, 행사별로 `programs.staff_permissions` 로 덮어쓸 수 있다.
 *  - 서버 액션은 `denyUnless(ctx, key)` 로 검사한다. 발주처(institution) 역할은 이 표의 대상이 아니다(열람 + 정산 확인).
 * 클라이언트·서버 공용 순수 모듈.
 */
import type { UserRole } from '@/lib/auth/roles';

export type StaffGrade = 'pl' | 'pm' | 'deputy_pm' | 'observer';
export const STAFF_GRADES: StaffGrade[] = ['pl', 'pm', 'deputy_pm', 'observer'];
export const GRADE_LABELS: Record<StaffGrade, string> = { pl: '메인 담당(PL)', pm: 'PM', deputy_pm: '부PM', observer: '옵저버' };
export const GRADE_HINTS: Record<StaffGrade, string> = {
  pl: '행사 운영 총괄. 모든 권한',
  pm: '운영 실무 전반. 단가·원천징수 등 금액 설정과 계정 삭제·대행은 제한',
  deputy_pm: 'PM 보조. 품의 제출·운영 설정 변경은 제한',
  observer: '현황 확인·자문. 열람과 종합결과리포트 생성만 가능',
};

export type CapabilityKey =
  | 'case.manage'
  | 'case.delete'
  | 'case.assign'
  | 'review'
  | 'settlement'
  | 'settlement.submit'
  | 'members'
  | 'members.staff'
  | 'members.sensitive'
  | 'members.view_as'
  | 'mentors.docs'
  | 'settings'
  | 'settings.money'
  | 'sms'
  | 'surveys'
  | 'reports';

export const CAPABILITIES: { key: CapabilityKey; label: string; desc: string }[] = [
  { key: 'case.manage', label: '멘티 등록·승계·서류', desc: '케이스 등록, 승계 개설, 서류 첨부·공개 설정, 내부 메모' },
  { key: 'case.delete', label: '케이스 완전 삭제', desc: '테스트 데이터 청소용 케이스 삭제 (하위 데이터·파일 포함). 기본 PL 전용' },
  { key: 'case.assign', label: '멘토 배정·교체·매칭', desc: '배정·교체·회수, AI 매칭 추천 생성, 프로필 편집' },
  { key: 'review', label: '검수·요청 처리', desc: '종결 검수 승인/보완, 추가 회차·멘토 변경·중도 종료 요청 처리' },
  { key: 'settlement', label: '정산 확정·품의 편성', desc: '정산 확정 취소, 품의 묶음 생성·편성·삭제' },
  { key: 'settlement.submit', label: '품의 제출·지급 완료', desc: '발주처 제출·철회, 지급 완료 표시' },
  { key: 'members', label: '회원 발급·소속·정보', desc: '계정 발급, 엑셀 일괄 등록, 기존 계정 추가, 멘토·멘티·발주처 역할 변경·소속 해제, 정보 수정' },
  { key: 'members.staff', label: '운영사 담당자 등급·역할·소속', desc: '운영사 담당자의 등급·역할 변경, 소속 해제·비활성, 담당 그룹 지정. 메인 담당(PL) 지정은 PL 만 가능' },
  { key: 'members.sensitive', label: '계정 비활성·삭제·비밀번호', desc: '비활성화, 삭제, 임시 비밀번호 재발급, 민감정보 원문 열람' },
  { key: 'members.view_as', label: '회원 화면 대행', desc: '멘토·멘티 계정으로 대행 로그인해 회차·보고서·서류를 대신 처리 (P31: 삭제·비밀번호 권한과 분리)' },
  { key: 'mentors.docs', label: '멘토 지급서류·평가', desc: '지급서류 수령 체크, 그룹별 원천징수, 멘토 평가·메모' },
  { key: 'settings', label: '운영 설정(일반)', desc: '행사 기본·그룹·필수서류·정책·양식·키워드' },
  { key: 'settings.money', label: '운영 설정(금액)', desc: '단가·한도·원천징수 방식' },
  { key: 'sms', label: '문자 발송·문자 API', desc: '문자 일괄 발송·예약, 행사별 문자 API 등록' },
  { key: 'surveys', label: '조사 개설·독려', desc: '조사(만족도·선호도 등) 개설·종료, 초대·미참여 독려 문자' },
  { key: 'reports', label: '리포트·종합결과리포트', desc: '리포트 열람·내보내기, 종합결과리포트 생성' },
];
const ALL = CAPABILITIES.map((c) => c.key);

/** PL 전용(기본) — 등급 보호·삭제처럼 사고 시 복구가 어려운 권한 */
const PL_ONLY: CapabilityKey[] = ['members.staff', 'case.delete'];

export const DEFAULT_GRANTS: Record<StaffGrade, CapabilityKey[]> = {
  pl: ALL,
  pm: ALL.filter((k) => k !== 'settings.money' && k !== 'members.sensitive' && !PL_ONLY.includes(k)),
  // 부PM 은 대행 불가(기본) — 행사별 override 로 열 수 있다
  deputy_pm: ALL.filter((k) => !['settings.money', 'members.sensitive', 'members.view_as', 'settlement.submit', 'settings'].includes(k) && !PL_ONLY.includes(k)),
  observer: ['reports'],
};

/** 인턴(데이터 입력·문자 보조) 프리셋 — 부PM 등급에 적용하는 최소 권한 */
export const INTERN_PRESET: CapabilityKey[] = ['members', 'mentors.docs', 'sms'];

/** programs.staff_permissions 의 회원별 override 키 (`user:<userId>`: CapabilityKey[]) */
export const userOverrideKey = (userId: string) => `user:${userId}`;

export function isStaffGrade(v: unknown): v is StaffGrade {
  return typeof v === 'string' && (STAFF_GRADES as string[]).includes(v);
}

/**
 * 행사별 override(programs.staff_permissions: { grade: [keys], "user:<id>": [keys] }) 를 반영한 최종 권한.
 * userId 를 주면 그 회원 전용 override(`user:<id>`)가 등급표보다 우선한다.
 * grade null 은 레거시 행(0080 백필 전)으로 PL 취급.
 */
export function resolveGrants(grade: StaffGrade | null | undefined, override: unknown, userId?: string | null): CapabilityKey[] {
  const g: StaffGrade = grade ?? 'pl';
  const o = override && typeof override === 'object' && !Array.isArray(override) ? (override as Record<string, unknown>) : {};
  const clean = (list: unknown[]) => list.filter((k): k is CapabilityKey => (ALL as string[]).includes(String(k)));
  if (userId) {
    const per = o[userOverrideKey(userId)];
    if (Array.isArray(per)) return clean(per);
  }
  const custom = o[g];
  if (Array.isArray(custom)) return clean(custom);
  return DEFAULT_GRANTS[g];
}

/** 메인 담당(PL) 여부 — null 등급은 레거시 행으로 PL 취급 */
export function isPL(grade: StaffGrade | null | undefined): boolean {
  return !grade || grade === 'pl';
}

export interface GrantHolder {
  role: UserRole;
  grade: StaffGrade | null;
  grants: CapabilityKey[];
}

export function hasCapability(h: GrantHolder | null | undefined, key: CapabilityKey): boolean {
  if (!h) return false;
  if (h.role !== 'nextlab') return false;
  return h.grants.includes(key);
}

/** 서버 액션용 — 권한이 없으면 안내 문구, 있으면 null */
export function denyUnless(h: GrantHolder | null | undefined, key: CapabilityKey): string | null {
  if (hasCapability(h, key)) return null;
  const label = CAPABILITIES.find((c) => c.key === key)?.label ?? key;
  const grade = h?.grade ? GRADE_LABELS[h.grade] : '현재 등급';
  return `${grade}에게는 '${label}' 권한이 없습니다. 메인 담당자(PL)에게 요청하세요.`;
}
