'use client';

import { Search } from 'lucide-react';

import { ExcelButton } from '@/components/common/excel-button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ListToolbarFilter {
  key: string;
  label: string;
  count?: number;
}

/**
 * 목록 상단 툴바 (스카이블루) — 요약 · 필터 칩 · 검색 · 엑셀.
 * 매칭 리스트·정산·조사 등 목록 화면이 같은 모양으로 쓴다.
 */
export function ListToolbar({
  summary,
  query,
  onQuery,
  placeholder = '이름 검색',
  filters,
  active,
  onFilter,
  exportHref,
  exportLabel,
  extra,
  className,
}: {
  summary?: React.ReactNode;
  query?: string;
  onQuery?: (v: string) => void;
  placeholder?: string;
  filters?: ListToolbarFilter[];
  active?: string;
  onFilter?: (key: string) => void;
  exportHref?: string;
  exportLabel?: string;
  extra?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-sky-300 bg-sky-100 px-4 py-2.5 dark:border-sky-800 dark:bg-sky-950/40', className)}>
      {summary && <div className="text-sm font-semibold text-sky-950 dark:text-sky-100">{summary}</div>}
      {filters && filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="필터">
          {filters.map((f) => {
            const on = (active ?? filters[0]?.key) === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => onFilter?.(f.key)}
                className={cn(
                  // (P31) 폰 탭 타깃 py-1.5
                  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors sm:py-1',
                  on ? 'bg-midnight text-white shadow-sm' : 'bg-white/70 text-sky-950 hover:bg-white dark:bg-sky-900/40 dark:text-sky-100',
                )}
              >
                {f.label}
                {f.count !== undefined && <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', on ? 'bg-white/20' : 'bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100')}>{f.count}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
        {extra}
        {onQuery && (
          <div className="relative w-full sm:w-auto">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query ?? ''} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-10 w-full bg-background pl-8 sm:h-9 sm:w-44" />
          </div>
        )}
        {exportHref && <ExcelButton href={exportHref} label={exportLabel} />}
      </div>
    </div>
  );
}
