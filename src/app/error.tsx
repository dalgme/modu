'use client';

import { ErrorFallback } from '@/components/common/error-fallback';

/**
 * 루트 오류 경계 (P34-B) — 각 역할 레이아웃(`(nextlab)/layout.tsx` 등) **자체**에서 난 오류가 여기로 온다.
 * (2026-09-28 장애처럼 레이아웃의 RSC 직렬화 오류는 그 그룹의 error.tsx 가 아니라 이 파일이 받는다.)
 * 루트 레이아웃 안에서 렌더되므로 폰트·Tailwind·토스트는 살아 있다. 루트 레이아웃 자체 오류는 global-error.tsx.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} scope="root" homeHref="/hub" />;
}
