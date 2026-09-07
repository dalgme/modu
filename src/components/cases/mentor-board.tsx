'use client';

import { useMemo, useState } from 'react';

import type { CaseListItem } from '@/lib/data/cases';
import { CaseProgressList } from '@/components/cases/case-progress-list';
import { cn } from '@/lib/utils';

const NO_MENTOR = '__none__';

/**
 * 멘토별 현황판 (세로 메뉴형).
 * 좌측에 멘토명을 메뉴로 나열하고, 멘토를 클릭하면 우측에 담당 멘티기업 리스트를
 * 각 기업의 진행단계와 함께 표시한다. 멘토 미배정 기업은 별도 메뉴로 노출.
 */
export function MentorBoard({
  items,
  basePath,
  editGrantIds = [],
}: {
  items: CaseListItem[];
  basePath: string;
  editGrantIds?: string[];
}) {
  const editGrantSet = useMemo(() => new Set(editGrantIds), [editGrantIds]);
  // 멘토명 → 담당 기업 그룹핑
  const groups = useMemo(() => {
    const map = new Map<string, CaseListItem[]>();
    for (const c of items) {
      const key = c.mentorName ?? NO_MENTOR;
      const list = map.get(key);
      if (list) list.push(c);
      else map.set(key, [c]);
    }
    return map;
  }, [items]);

  // 메뉴 순서: 멘토명 가나다순, 미배정은 맨 아래
  const menu = useMemo(() => {
    return Array.from(groups.keys()).sort((a, b) => {
      if (a === NO_MENTOR) return 1;
      if (b === NO_MENTOR) return -1;
      return a.localeCompare(b, 'ko');
    });
  }, [groups]);

  const [activeKey, setActiveKey] = useState<string>(menu[0] ?? NO_MENTOR);
  const active = menu.includes(activeKey) ? activeKey : (menu[0] ?? NO_MENTOR);
  const activeItems = groups.get(active) ?? [];

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        표시할 케이스가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      {/* 멘토 메뉴 */}
      <nav className="flex flex-col gap-1 rounded-lg border bg-card p-2">
        {menu.map((key) => {
          const isNone = key === NO_MENTOR;
          const count = groups.get(key)?.length ?? 0;
          const isActive = key === active;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveKey(key)}
              aria-current={isActive}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                !isActive && isNone && 'text-muted-foreground',
              )}
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {isNone ? '멘토 미배정' : key}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 text-xs tabular-nums',
                  isActive ? 'bg-white/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 선택 멘토의 담당 기업 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">
            {active === NO_MENTOR ? '멘토 미배정' : `멘토 ${active}`}
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {activeItems.length}개 기업
          </span>
        </div>
        <CaseProgressList items={activeItems} basePath={basePath} editGrantCaseIds={editGrantSet} />
      </div>
    </div>
  );
}
