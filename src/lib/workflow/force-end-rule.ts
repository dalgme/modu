/**
 * 멘티 비활성화 차단 규칙 (P36-2, 2026-09-29 사용자 결정) — 서버·클라이언트 중립 파일.
 *
 * "멘토가 배정되고 최소 1회차 멘토링이 진행 완료된(보고서 등록) 멘티는 비활성화할 수 없고 강제 종료(멘티 중도 종료)로 처리한다."
 * 비활성화를 허용하면 이행 회차의 부분 정산이 확정되지 않은 채 명단에서 사라진다. 중도 종료(withdraw_case)는
 * 부분 정산 스냅샷을 먼저 만든 뒤 케이스를 종료하므로(P30), 그 경로를 거친 뒤에만 비활성화할 수 있다.
 *
 * 화면 버튼(회원 명단)과 서버 게이트(단건·일괄 비활성화, 계정 잠금, 소속 해제)가 이 파일 하나를 읽는다 — CLAUDE.md §3 불변 규칙.
 */
import type { CaseStatus } from '@/types/case-status';

/**
 * 멘토링이 진행 중인 상태 — 이 상태의 케이스에 보고서 등록 회차가 1건 이상이면 강제 종료가 필요하다.
 * registered 는 배정 전이라 회차가 없고, 정산 확정(settlement_pending 이후)·종결(closed)·중도 종료(withdrawn) 는 이미 정리된 케이스다.
 */
export const FORCE_END_REQUIRED_STATUSES: readonly CaseStatus[] = [
  'mentor_assigned',
  'in_progress',
  'reassignment_pending',
  'closure_requested',
  'revision_requested',
];

export interface ForceEndBlock {
  caseId: string;
  /** 보고서까지 등록된(이행) 회차 수 */
  reportedRounds: number;
  groupName: string | null;
}

/** 이 케이스 때문에 멘티 비활성화를 막아야 하는가 */
export function requiresForceEnd(status: CaseStatus, reportedRounds: number): boolean {
  return reportedRounds >= 1 && FORCE_END_REQUIRED_STATUSES.includes(status);
}

/** 강제 종료 화면 경로 — 운영사 케이스 상세의 [중도 종료 처리] 카드 */
export function forceEndHref(caseId: string): string {
  return `/nextlab/cases/${caseId}#case-end-panel`;
}

/** 서버 오류·화면 안내 공용 문구 */
export function forceEndMessage(name: string | null, block: Pick<ForceEndBlock, 'reportedRounds' | 'groupName'>): string {
  const who = name ? `${name} 멘티는 ` : '';
  const group = block.groupName ? `${block.groupName} ` : '';
  return `${who}${group}멘토링이 ${block.reportedRounds}회 진행되어 비활성화할 수 없습니다. 케이스 화면에서 [멘티 중도 종료](강제 종료)로 처리하면 이행 회차가 부분 정산된 뒤 비활성화할 수 있습니다.`;
}
