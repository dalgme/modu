'use client';

import { ErrorFallback } from '@/components/common/error-fallback';

/** (mentee) 오류 경계 (P34-B) — 이 세그먼트 아래 페이지·중첩 레이아웃의 오류를 받는다. 레이아웃 자체의 오류는 상위 error.tsx 로. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} scope="mentee" homeHref="/mentee/dashboard" />;
}
