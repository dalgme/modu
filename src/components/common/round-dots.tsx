import { circledNumber } from '@/lib/utils/labels';
import { cn } from '@/lib/utils';

/**
 * 회차 진행 표시 (P25-13·14) — ①②③④ 를 목표 회차만큼 그리고, 이행(보고서 등록)된 회차까지 색을 채운다.
 * 목표를 넘긴 추가 회차는 뒤에 이어 붙인다.
 */
export function RoundDots({ done, required, className }: { done: number; required: number; className?: string }) {
  const total = Math.max(required, done, 0);
  if (total === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-0.5 whitespace-nowrap', className)} title={`이행 ${done} / 목표 ${required}회`} aria-label={`이행 ${done} / 목표 ${required}회`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const filled = n <= done;
        const extra = n > required;
        return (
          <span
            key={n}
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded-full text-[13px] leading-none',
              filled ? 'bg-emerald-600 text-white dark:bg-emerald-500' : 'bg-muted text-muted-foreground',
              extra && !filled && 'ring-1 ring-dashed ring-amber-400',
            )}
          >
            {circledNumber(n)}
          </span>
        );
      })}
    </span>
  );
}
