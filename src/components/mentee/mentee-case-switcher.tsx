import Link from 'next/link';

import type { CaseListItem } from '@/lib/data/cases';
import { CASE_STATUS_META } from '@/types/case-status';
import { formatDate } from '@/lib/utils/format';

/**
 * 멘티 케이스 선택 (P30) — 승계로 한 행사에 케이스가 여러 건일 때 회차·만족도 화면 상단에서 고른다.
 * 서버 컴포넌트(링크만). 할 일이 있는 케이스는 배지로 표시.
 */
export function MenteeCaseSwitcher({
  href,
  cases,
  currentId,
  pending,
  hint,
}: {
  href: string;
  cases: CaseListItem[];
  currentId: string;
  pending: Record<string, { unsigned: number; surveyOpen: boolean }>;
  hint: 'unsigned' | 'survey';
}) {
  return (
    <nav className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-2 text-sm" aria-label="케이스 선택">
      <span className="px-1 text-xs text-muted-foreground">참여 그룹</span>
      {cases.map((c) => {
        const p = pending[c.id];
        const badge = hint === 'unsigned' ? (p && p.unsigned > 0 ? `서명 ${p.unsigned}` : null) : p?.surveyOpen ? '응답 대기' : null;
        const active = c.id === currentId;
        return (
          <Link key={c.id} href={`${href}?case=${c.id}`} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`} aria-current={active ? 'page' : undefined}>
            {c.supportTypeName ?? '그룹'}
            <span className={active ? 'opacity-80' : 'text-muted-foreground'}>· {CASE_STATUS_META[c.status].short} · {formatDate(c.created_at)}</span>
            {badge && <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-primary-foreground/20' : 'bg-amber-100 text-amber-800'}`}>{badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
