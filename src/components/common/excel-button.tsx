import { FileSpreadsheet } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * 엑셀 내보내기/다운로드 버튼 (P26-01) — 플랫폼 전체 공통 "옐로우 그린" 스타일.
 * 서버·클라이언트 어디서나 쓰는 순수 링크. 라벨 기본 "엑셀 내보내기".
 */
export function ExcelButton({ href, label = '엑셀 내보내기', className, title }: { href: string; label?: string; className?: string; title?: string }) {
  return (
    <a
      href={href}
      title={title}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-lime-500 bg-lime-400 px-3 text-xs font-bold text-lime-950 shadow-sm transition-colors hover:bg-lime-500 dark:border-lime-600 dark:bg-lime-500 dark:text-lime-950 dark:hover:bg-lime-400',
        className,
      )}
    >
      <FileSpreadsheet className="h-4 w-4" />
      {label}
    </a>
  );
}
