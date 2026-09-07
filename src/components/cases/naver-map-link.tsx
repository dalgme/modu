import { MapPin } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * 주소를 네이버 지도 검색으로 연결하는 링크.
 * 클릭 시 새 탭에서 `https://map.naver.com/p/search/{주소}` 를 열어 위치를 바로 확인한다.
 * 주소가 비어 있으면 '-' 를 표시한다.
 */
export function NaverMapLink({
  address,
  className,
}: {
  address: string | null;
  className?: string;
}) {
  const value = address?.trim();
  if (!value) return <>-</>;

  const href = `https://map.naver.com/p/search/${encodeURIComponent(value)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="네이버 지도에서 위치 보기"
      className={cn(
        'group inline-flex items-start gap-1 text-status-progress underline-offset-2 hover:underline',
        className,
      )}
    >
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{value}</span>
    </a>
  );
}
