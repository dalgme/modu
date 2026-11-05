/**
 * 멘티 라운드(사업그룹) 선택 규칙 (2026-11-05) — 순수 함수(화면 버튼·서버 게이트 공용).
 *
 * 멘티는 라운드마다 케이스 1건(1멘티 = 1케이스, 그룹당)을 가진다. 회원 명단 > 멘티 [정보 수정]의 라운드 칩으로
 *  - 켜기 = 그 라운드에 케이스를 새로 만든다(기존 케이스의 멘티 정보 복사)
 *  - 끄기 = 그 라운드 케이스를 지운다 — **진행 기록이 하나도 없는 케이스만**(실수 등록 정리용).
 * 회차·정산·서류·만족도 응답·승계 연결이 하나라도 있으면 지우지 않는다(그때는 케이스 상세의 중도 종료·진행 내역 삭제를 쓴다).
 */

export interface MenteeRoundCaseFacts {
  status: string;
  logs: number;
  settlements: number;
  documents: number;
  surveyResponses: number;
  /** 이 케이스를 이전 단계로 가리키는 승계 케이스 수 */
  successors: number;
}

/** 라운드에서 빼기(케이스 삭제)가 막히는 이유 — null 이면 뺄 수 있다 */
export function menteeRoundRemovalBlock(f: MenteeRoundCaseFacts): string | null {
  if (f.logs > 0) return `멘토링 회차 ${f.logs}건이 등록되어 있어 뺄 수 없습니다. 케이스 상세에서 [중도 종료 처리] 또는 [진행 내역 삭제]를 이용하세요.`;
  if (f.settlements > 0) return '정산 기록이 있어 뺄 수 없습니다.';
  if (f.documents > 0) return `서류(사업계획서 등) ${f.documents}건이 첨부되어 있어 뺄 수 없습니다. 서류를 먼저 정리하세요.`;
  if (f.surveyResponses > 0) return '만족도 응답이 있어 뺄 수 없습니다.';
  if (f.successors > 0) return '이 케이스를 이어받은 다음 라운드 케이스가 있어 뺄 수 없습니다.';
  if (!['registered', 'mentor_assigned', 'reassignment_pending', 'withdrawn'].includes(f.status)) return '지금 단계에서는 뺄 수 없습니다.';
  return null;
}

/** 라운드 추가가 막히는 이유 — 같은 라운드에 진행 중(중도 종료 제외) 케이스가 있거나 종료된 라운드면 불가 */
export function menteeRoundAddBlock(g: { status: string; hasOpenCase: boolean }): string | null {
  if (g.hasOpenCase) return '이미 이 라운드에 등록되어 있습니다.';
  if (g.status !== 'active') return '종료된 라운드에는 추가할 수 없습니다.';
  return null;
}
