/**
 * 매칭 순수 함수 (P25) — 서버·클라이언트 공용, DB 접근 없음.
 */

/**
 * 멘토 그룹 지정 규칙: 멘토는 기본적으로 행사 안 모든 그룹(라운드)에서 쓸 수 있다(정보 복제).
 * 그룹 명부(support_type_members)에 하나라도 지정되어 있으면 **지정된 그룹에서만** 후보가 된다.
 */
export function mentorEligibleForGroup(designatedGroupIds: ReadonlySet<string> | string[], groupId: string): boolean {
  const set = designatedGroupIds instanceof Set ? designatedGroupIds : new Set(designatedGroupIds);
  return set.size === 0 || set.has(groupId);
}

const norm = (s: string) => s.toLowerCase().replace(/[\s·,/()-]/g, '');

/** 분야 적합: 정규화 후 동일하거나 한쪽이 다른 쪽을 포함. 일치한 멘토 분야 문자열을 돌려준다. */
export function fieldMatches(need: string, expertise: string[]): string | null {
  const n = norm(need);
  if (!n) return null;
  for (const e of expertise) {
    const x = norm(e);
    if (!x) continue;
    if (x === n || x.includes(n) || n.includes(x)) return e;
  }
  return null;
}

/** 멘티 희망분야(순위) ↔ 멘토 분야 연결 목록 — [배정] 팝업·확정 근거 표시용 */
export function matchedPairs(needs: string[], expertise: string[]): { rank: number; need: string; matched: string | null }[] {
  return needs.slice(0, 6).map((need, i) => ({ rank: i + 1, need, matched: fieldMatches(need, expertise) }));
}
