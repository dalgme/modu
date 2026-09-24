import { cn } from '@/lib/utils';

function Bone({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

/**
 * 페이지 로딩 스켈레톤 — 라우트 그룹 `loading.tsx` 공용.
 * 제목 · 요약 카드 줄 · 표 형태를 흉내내 내용이 오기 전 레이아웃 흔들림을 줄인다.
 */
export function PageSkeleton({ cards = 4, rows = 6, className }: { cards?: number; rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-6', className)} role="status" aria-live="polite" aria-label="불러오는 중">
      <div className="flex flex-col gap-2">
        <Bone className="h-7 w-48" />
        <Bone className="h-4 w-80 max-w-full" />
      </div>
      {cards > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => (
            <Bone key={i} className="h-20" />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 rounded-xl border bg-background p-4">
        <Bone className="h-4 w-1/3" />
        {Array.from({ length: rows }).map((_, i) => (
          <Bone key={i} className="h-9" />
        ))}
      </div>
      <span className="sr-only">불러오는 중…</span>
    </div>
  );
}
