/**
 * 그룹멘토링 규칙 (2026-11-04) — 순수 함수(서버·화면·테스트 공용).
 *
 * 그룹멘토링 1회 = 세션 1개 + 참여 멘티마다 회차(mentoring_logs) 1행.
 *  - 멘티는 각자 1회의 멘토링을 받은 것으로 센다(회차 번호·보고서·서명·종결 판정은 멘티별 회차 그대로).
 *  - 멘토 수당은 세션당 **1회분**: 참여 회차 중 한 행(수당 대표 회차)만 시간당 단가 × 운영시간 금액을 갖고, 나머지는 0원.
 *    정산·예산·리포트·엑셀은 원래 회차 금액 스냅샷의 합계라, 이렇게 두면 어디서 더해도 1회분만 잡힌다.
 *
 * 수당 대표 회차 고르기 (pickGroupFeeHolder):
 *  1) 이미 정산에 들어간 회차가 금액을 갖고 있으면 그 회차 (확정본은 절대 바꾸지 않는다)
 *  2) 보고서가 등록된(정산 전) 회차 중 — 지금 대표가 그중에 있으면 유지, 아니면 보고서를 가장 먼저 등록한 회차
 *     → 대표 멘티가 보고서를 못 올려도, 다른 멘티 보고서가 등록되는 순간 수당이 잡힌다
 *  3) 보고서가 하나도 없으면 — 지금 대표 유지, 없으면 첫 참여 회차(예상 금액 표시용)
 */

export const GROUP_MIN_MENTEES = 2;
export const GROUP_MAX_PER_MENTOR_LIMIT = 20;

export interface GroupFeeLog {
  id: string;
  /** 정산(settlement_id)에 포함됨 — 금액을 바꾸지 않는다 */
  settled: boolean;
  amount: number;
  unitPrice: number;
  reportedAt: string | null;
  holder: boolean;
  /** 참여 순서(등록 순) — 동률 정렬용 */
  seq: number;
}

export function pickGroupFeeHolder(logs: GroupFeeLog[]): string | null {
  if (logs.length === 0) return null;
  const paid = logs.find((l) => l.settled && Number(l.amount) > 0);
  if (paid) return paid.id;
  const open = logs.filter((l) => !l.settled);
  if (open.length === 0) return null;
  const reported = open.filter((l) => l.reportedAt).sort((a, b) => (a.reportedAt! < b.reportedAt! ? -1 : a.reportedAt! > b.reportedAt! ? 1 : a.seq - b.seq));
  if (reported.length > 0) return (reported.find((l) => l.holder) ?? reported[0]!).id;
  return (open.find((l) => l.holder) ?? [...open].sort((a, b) => a.seq - b.seq)[0]!).id;
}

export interface GroupFeeUpdate {
  id: string;
  holder: boolean;
  unitPrice: number;
  amount: number;
}

/**
 * 세션 회차들의 금액 배정 계획. fullUnitPrice·fullAmount = 세션 1회분(시간당 단가, 단가 × 운영시간).
 * 정산 전 회차만, 지금 값과 다를 때만 돌려준다.
 */
export function planGroupFee(logs: GroupFeeLog[], full: { unitPrice: number; amount: number }): GroupFeeUpdate[] {
  const holderId = pickGroupFeeHolder(logs);
  const out: GroupFeeUpdate[] = [];
  for (const l of logs) {
    if (l.settled) continue;
    const isHolder = l.id === holderId;
    const unitPrice = isHolder ? full.unitPrice : 0;
    const amount = isHolder ? full.amount : 0;
    if (l.holder !== isHolder || Number(l.unitPrice) !== unitPrice || Number(l.amount) !== amount) out.push({ id: l.id, holder: isHolder, unitPrice, amount });
  }
  return out;
}

/** 라운드 설정 해석 — 값이 없으면 꺼짐 */
export function groupMentoringSetting(g: { group_mentoring_enabled?: boolean | null; group_mentoring_max_per_mentor?: number | null } | null | undefined): { enabled: boolean; maxPerMentor: number } {
  const max = Math.max(0, Math.min(GROUP_MAX_PER_MENTOR_LIMIT, Math.floor(Number(g?.group_mentoring_max_per_mentor ?? 0)) || 0));
  return { enabled: !!g?.group_mentoring_enabled && max > 0, maxPerMentor: max };
}

/** 멘토가 이 라운드에서 그룹멘토링을 더 등록할 수 있는지 (화면 버튼·서버 게이트 공용) */
export function groupSessionLimitError(used: number, maxPerMentor: number): string | null {
  if (maxPerMentor <= 0) return '이 라운드는 그룹멘토링을 사용하지 않습니다.';
  if (used >= maxPerMentor) return `이 라운드의 그룹멘토링은 멘토 1인당 ${maxPerMentor}회까지 등록할 수 있습니다. (이미 ${used}회 등록)`;
  return null;
}

/** 세션 일정 수정·삭제 가능 여부 — 참여 회차 중 보고서 등록·정산된 회차가 없을 때만 (화면 버튼·서버 공용) */
export function groupSessionEditable(logs: { reported: boolean; settled: boolean }[]): boolean {
  return logs.every((l) => !l.reported && !l.settled);
}

export const GROUP_LOG_EDIT_ERROR = '그룹멘토링 회차의 일정은 [그룹멘토링] 화면에서 함께 수정합니다.';
