import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

import { cn } from '@/lib/utils';

/** 빈 목록 안내 — 아이콘 · 제목 · 힌트 · (선택) 행동 버튼. 서버·클라이언트 공용. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-background text-center', compact ? 'px-4 py-6' : 'px-6 py-10', className)}>
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
