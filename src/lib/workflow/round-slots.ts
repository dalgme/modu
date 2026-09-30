/**
 * 회차 번호 자리 규칙 (2026-09-30) — 서버·클라이언트 중립 파일.
 * 보고서까지 등록된 회차도 개별 삭제할 수 있고(정산 미포함·멘티 서명 전·본인 등록), 삭제된 번호는 비워 둔다.
 * 다음 [N차 예정 등록]은 비어 있는 가장 앞 번호를 채운다 — 이미 저장된 보고서 파일명(…-N회차-…)이 어긋나지 않게 번호를 당기지 않는다.
 * 멘토 화면의 활성 행(다음 차례)과 서버 submitRound 의 번호 부여가 이 함수를 같이 읽는다.
 */
export function firstEmptyRoundNo(existing: number[]): number {
  const taken = new Set(existing);
  let no = 1;
  while (taken.has(no)) no += 1;
  return no;
}

/** 멘토 회차 행 [삭제] 버튼 조건 — 서버 deleteRound/deletePlannedRound 게이트와 같은 조건 */
export function canMentorDeleteRound(r: { editable: boolean; own: boolean; locked: boolean; menteeSigned: boolean }): boolean {
  return r.editable && r.own && !r.locked && !r.menteeSigned;
}
