/**
 * 라운드(사업그룹)별 매칭정보 공개 규칙 (P54) — 서버·클라이언트 공용 중립 파일.
 *
 * 감추기(matching_published = false)인 그룹은 멘토가 자신에게 배정된 멘티를, 멘티가 담당 멘토를 볼 수 없다.
 * 운영사 콘솔(명단·매칭 리스트·리포트)에는 그대로 보인다. 컬럼이 없는 DB(마이그레이션 0092 전)에서는
 * 값이 undefined 라 "공개"로 읽어 기존 동작을 지킨다.
 */
export function isMatchingPublished(row: { matching_published?: boolean | null } | null | undefined): boolean {
  return row?.matching_published !== false;
}

/** 멘토 화면 — 감추기 그룹의 케이스를 열었을 때 */
export const MATCHING_HIDDEN_MENTOR_NOTICE = '이 라운드의 멘토-멘티 매칭은 아직 공개 전입니다. 운영사가 매칭을 마치고 공개하면 담당 멘티 정보가 보입니다.';

/** 멘티 화면 — 담당 멘토 자리 */
export const MATCHING_HIDDEN_MENTEE_NOTICE = '담당 멘토 매칭을 준비하고 있습니다. 운영사가 매칭을 확정해 공개하면 이곳에 담당 멘토가 표시됩니다.';

/** 멘토 액션을 감추기 그룹 케이스에 시도했을 때 */
export const MATCHING_HIDDEN_ACTION_ERROR = '이 라운드의 매칭정보가 아직 공개되지 않았습니다. 운영사가 공개한 뒤에 진행할 수 있습니다.';
