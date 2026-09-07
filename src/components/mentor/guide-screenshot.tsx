'use client';

import { useState } from 'react';
import { ImageIcon } from 'lucide-react';

/**
 * 안내 페이지 화면 캡쳐 슬롯.
 * public/images/guide/{name}.png 가 있으면 실제 캡쳐를 보여주고, 없으면 캡션 플레이스홀더를
 * 렌더한다. (실제 스크린샷은 같은 경로에 PNG 를 올리면 자동 반영)
 */
export function GuideScreenshot({ name, caption }: { name: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  const src = `/images/guide/${name}.png`;

  return (
    <figure className="overflow-hidden rounded-lg border bg-muted/30">
      <div className="flex items-center gap-1.5 border-b bg-muted/60 px-3 py-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-status-rejected/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-status-progress/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-status-approved/50" />
        <span className="ml-2 truncate text-xs text-muted-foreground">{caption}</span>
      </div>
      {failed ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
          <ImageIcon className="h-7 w-7 opacity-50" />
          <p className="text-xs">화면 미리보기 · {caption}</p>
        </div>
      ) : (
        // 캡처 원본 비율 유지(찌그러짐 방지): 너비 100% + 높이 자동, 너무 크면 축소만.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={caption}
          className="mx-auto block h-auto w-full max-h-[70vh] object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </figure>
  );
}
