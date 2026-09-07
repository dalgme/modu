/** 케이스 상세 섹션별 색상 액센트 (멘토 화면 UX 고도화용) */
export type SectionAccent = 'coral' | 'blue' | 'green' | 'violet';

/** 카드 좌측 컬러 보더 + 상단 옅은 틴트 */
export const ACCENT_CARD: Record<SectionAccent, string> = {
  coral: 'border-l-4 border-l-primary',
  blue: 'border-l-4 border-l-status-progress',
  green: 'border-l-4 border-l-status-approved',
  violet: 'border-l-4 border-l-violet-500',
};

/** 섹션 제목 색상 */
export const ACCENT_TITLE: Record<SectionAccent, string> = {
  coral: 'text-primary',
  blue: 'text-status-progress',
  green: 'text-status-approved',
  violet: 'text-violet-600 dark:text-violet-400',
};

/** 제목 앞 아이콘 배지 배경 */
export const ACCENT_BADGE: Record<SectionAccent, string> = {
  coral: 'bg-primary/10 text-primary',
  blue: 'bg-status-progress/10 text-status-progress',
  green: 'bg-status-approved/10 text-status-approved',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
};
