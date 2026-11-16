/**
 * 품의 정산 확인 주체 (2026-11-16) — 서버·클라이언트 중립 규칙.
 * 라운드(사업그룹) 설정 `institution_settlement_enabled`(발주처 [정산 품의] 기능, 기본 꺼짐)를 읽는다.
 *  - 품의에 든 정산의 라운드 중 하나라도 켜져 있으면 발주처가 정산 확인·반려한다.
 *  - 모두 꺼져 있으면(기본) 운영사가 직접 정산 확인한다 — 발주처에는 알림·확인 대기 건이 생기지 않는다.
 */
export type BatchConfirmer = 'institution' | 'operator';

export function batchConfirmerFor(groupFlags: (boolean | null | undefined)[]): BatchConfirmer {
  return groupFlags.some((f) => f === true) ? 'institution' : 'operator';
}

export const BATCH_CONFIRMER_LABELS: Record<BatchConfirmer, string> = {
  institution: '발주처 확인',
  operator: '운영사 확인',
};

/** 정산 확인 버튼을 이 역할에게 보여 줄지 — 서버 confirmBatchAction 게이트와 같은 규칙 */
export function canConfirmAs(role: 'nextlab' | 'institution', confirmer: BatchConfirmer): boolean {
  return role === 'nextlab' ? confirmer === 'operator' : confirmer === 'institution';
}

export const CONFIRMER_DENIED: Record<'nextlab' | 'institution', string> = {
  nextlab: '이 품의는 발주처가 정산 확인하는 라운드의 정산이 들어 있습니다. 운영 설정에서 [발주처 정산 품의 기능]을 끄면 운영사가 확인할 수 있습니다.',
  institution: '이 품의는 운영사가 정산 확인합니다(발주처 정산 품의 기능이 꺼진 라운드).',
};
