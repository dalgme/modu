/** 그룹멘토링 회차 표시 (2026-11-04) — 함께 참여한 멘티 + 수당 1회분이 어느 회차에 잡혔는지 */
export function GroupBadge({ peers, holder }: { peers: string[]; holder: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900 dark:bg-violet-950/50 dark:text-violet-100" title="그룹멘토링 수당은 1회분만 — 참여 회차 중 한 회차에 잡힙니다">
      그룹멘토링{peers.length > 0 ? ` · 함께: ${peers.join(', ')}` : ''}
      <span className="font-normal">({holder ? '수당 1회분 이 회차' : '수당은 함께한 멘티 회차에 1회분'})</span>
    </span>
  );
}
