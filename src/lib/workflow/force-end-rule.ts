/**
 * 멘티 비활성화 차단 규칙 — 서버·클라이언트 중립 파일.
 *
 * P36-2(2026-09-29): 진행 중 케이스에 보고서 등록 회차가 있으면 비활성화 대신 강제 종료(멘티 중도 종료).
 * 2026-11-03 사용자 결정으로 확대: **멘토링을 1회 이상 진행한 멘티는 그만두거나 마쳐도 비활성화하지 않는다.**
 *  - 멘토 화면에서도 빠지지 않고, 운영사가 [정보 수정] > 멘토링 포기·종료 구분에서 표시하면 '중도 포기'·'중도 종료'로 보인다.
 *  - 진행 회차 = 보고서가 등록됐거나 회차 종료 시각이 지난 회차 (보고서를 아직 안 올린 지난 회차도 멘토가 처리해야 하므로 포함).
 *  - 케이스 상태와 무관(종결·중도 종료 케이스도 포함). 회차 진행 없이 포기·종료한 멘티는 지금처럼 비활성화할 수 있다.
 *
 * 화면 버튼(회원 명단)과 서버 게이트(단건·일괄 비활성화, 계정 잠금, 소속 해제)가 이 파일 하나를 읽는다 — CLAUDE.md §3 불변 규칙.
 */

export interface ForceEndBlock {
  caseId: string;
  /** 진행된 회차 수 (보고서 등록 또는 종료 시각 경과) */
  reportedRounds: number;
  groupName: string | null;
}

/** 이 케이스 때문에 멘티 비활성화를 막아야 하는가 — 진행 회차 1회 이상 */
export function blocksDeactivation(progressedRounds: number): boolean {
  return progressedRounds >= 1;
}

/** 진행 회차인가 — 보고서 등록 또는 종료 시각이 기준 시각 이전 */
export function isProgressedRound(log: { report_registered_at: string | null; ended_at: string | null; started_at?: string | null }, now: number = Date.now()): boolean {
  if (log.report_registered_at) return true;
  const t = Date.parse(log.ended_at ?? log.started_at ?? '');
  return Number.isFinite(t) && t <= now;
}

/** 강제 종료 화면 경로 — 운영사 케이스 상세의 [중도 종료 처리] 카드 (정산까지 정리할 때) */
export function forceEndHref(caseId: string): string {
  return `/nextlab/cases/${caseId}#case-end-panel`;
}

/** 서버 오류·화면 안내 공용 문구 */
export function forceEndMessage(name: string | null, block: Pick<ForceEndBlock, 'reportedRounds' | 'groupName'>): string {
  const who = name ? `${name} 멘티는 ` : '';
  const group = block.groupName ? `${block.groupName} ` : '';
  return `${who}${group}멘토링을 ${block.reportedRounds}회 진행해 비활성화하지 않습니다(멘토 화면·통계 유지). 그만두었거나 마쳤다면 [정보 수정] > 멘토링 포기·종료 구분에서 [멘토링 포기]·[멘토링 종료]를 누르세요 — '중도 포기'·'중도 종료'로 표시됩니다.`;
}
