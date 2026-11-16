/**
 * 진행했던 멘토 (2026-11-16) — 서버·클라이언트 중립 규칙.
 * 멘토 중도 종료·운영사 강제 종료 등으로 활성 배정이 없어진 케이스에서도 "어떤 멘토가 진행했는지"를
 * 회원 명단·매칭 리스트·멘토링 현황 엑셀에 보여 주기 위한 판정. 현재 담당(mentorId)과는 별개 값이라
 * 배정·재배정·정원 계산에는 쓰지 않는다.
 */
export type AssignmentLite = { mentor_id: string; assigned_at: string; is_active: boolean; end_kind: string | null };

/**
 * 활성 배정이 없을 때 가장 최근에 끝난 배정의 멘토. 회차 없이 회수(recalled)된 배정은 '진행'이 아니므로 제외한다
 * (회수됐더라도 그 멘토가 회차를 진행했으면 포함). 활성 배정이 있으면 null.
 */
export function pickPastMentor(assigns: AssignmentLite[], mentorsWithRounds: Set<string>): { mentorId: string; endKind: string | null; assignedAt: string } | null {
  if (assigns.some((a) => a.is_active)) return null;
  const sorted = [...assigns].sort((a, b) => b.assigned_at.localeCompare(a.assigned_at));
  const hit = sorted.find((a) => a.end_kind !== 'recalled' || mentorsWithRounds.has(a.mentor_id));
  return hit ? { mentorId: hit.mentor_id, endKind: hit.end_kind, assignedAt: hit.assigned_at } : null;
}

const END_NOTES: Record<string, string> = {
  mentor_withdrawal: '멘토 중도 종료',
  forced: '멘토 중도 종료(운영사)',
  case_withdrawn: '멘티 중도 종료',
  case_closed: '종결',
  reassigned: '멘토 교체',
  recalled: '배정 회수',
};

/** 이름 옆 괄호 표기 — 예: "홍길동 (멘토 중도 종료)" */
export function pastMentorNote(endKind: string | null | undefined): string {
  return END_NOTES[endKind ?? ''] ?? '배정 종료';
}

export function pastMentorLabel(name: string, endKind: string | null | undefined): string {
  return `${name} (${pastMentorNote(endKind)})`;
}
