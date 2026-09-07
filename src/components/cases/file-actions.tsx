import { Eye, EyeOff, Download } from 'lucide-react';

import { cn } from '@/lib/utils';

const btnCls =
  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

const disabledCls =
  'inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs font-medium text-muted-foreground/60 cursor-not-allowed';

/**
 * 파일 '미리보기 / 다운로드' 액션 버튼 (읽기 전용 링크).
 * 서버·클라이언트 컴포넌트 어디서나 재사용(훅 미사용).
 *
 * previewable=false 인 형식(HWP/HWPX·오피스 문서 등)은 브라우저가 새 탭에서 렌더하지 못하고
 * 그대로 '다운로드'되므로, '미리보기' 링크 대신 미리보기 미지원임을 명확히 안내한다
 * (다운로드 버튼이 옆에 그대로 있으므로 기능 손실은 없다).
 */
export function FileActions({
  url,
  downloadUrl,
  previewable = true,
  className,
}: {
  url?: string | null;
  downloadUrl?: string | null;
  /** 웹 인라인 미리보기 가능 여부(PDF·이미지만 true). 기본 true(하위호환). */
  previewable?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('flex shrink-0 items-center gap-1', className)}>
      {url &&
        (previewable ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={btnCls}>
            <Eye className="h-3.5 w-3.5" />
            미리보기
          </a>
        ) : (
          <span
            className={disabledCls}
            title="HWP·오피스 문서 등은 웹 미리보기를 지원하지 않습니다. 다운로드하여 확인하세요."
          >
            <EyeOff className="h-3.5 w-3.5" />
            미리보기 미지원
          </span>
        ))}
      {downloadUrl && (
        <a href={downloadUrl} className={btnCls}>
          <Download className="h-3.5 w-3.5" />
          다운로드
        </a>
      )}
    </span>
  );
}
