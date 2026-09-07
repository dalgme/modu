import { Unlock } from 'lucide-react';

import { cn } from '@/lib/utils';

/** '임시 수정권한 열림' 표시 배지 (대시보드·현황판·상세 공용) */
export function EditGrantBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-400/50 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
        className,
      )}
      title="임시 수정권한이 열려 있는 케이스입니다"
    >
      <Unlock className="h-3 w-3" />
      임시 수정중
    </span>
  );
}
