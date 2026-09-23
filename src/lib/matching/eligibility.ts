/**
 * 멘토 그룹 지정 규칙 (P25) — 순수 함수, 서버·클라이언트 공용.
 * 멘토는 기본적으로 행사 안 모든 그룹(라운드)에서 쓸 수 있다(정보 복제).
 * 그룹 명부(support_type_members)에 하나라도 지정되어 있으면 **지정된 그룹에서만** 후보가 된다.
 */
export function mentorEligibleForGroup(designatedGroupIds: ReadonlySet<string> | string[], groupId: string): boolean {
  const set = designatedGroupIds instanceof Set ? designatedGroupIds : new Set(designatedGroupIds);
  return set.size === 0 || set.has(groupId);
}
