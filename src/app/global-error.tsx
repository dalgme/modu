'use client';

import { useEffect, useRef } from 'react';

import { reportClientError } from '@/components/common/error-fallback';

/**
 * 전역 오류 경계 (P34-B) — 루트 레이아웃(`src/app/layout.tsx`) 자체가 실패했을 때만 쓰인다.
 * 루트 레이아웃을 통째로 대체하므로 <html><body> 를 직접 그리고, globals.css 가 없으니 인라인 스타일로만 꾸민다.
 * 보고는 ErrorFallback 과 같은 `/api/client-error` (scope = global).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    reportClientError({ digest: error.digest ?? null, message: error.message, path: window.location.pathname, scope: 'global' });
  }, [error]);

  const btn: React.CSSProperties = {
    display: 'inline-block',
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid #103355',
    textDecoration: 'none',
  };
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: 'Pretendard, -apple-system, "Segoe UI", "Noto Sans KR", sans-serif', background: '#f6f7f9', color: '#1a1a1a' }}>
        <div role="alert" style={{ maxWidth: 480, margin: '0 auto', padding: '96px 16px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>화면을 불러오지 못했습니다</h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: '#555', margin: '0 0 20px' }}>
            일시적인 문제일 수 있습니다. [다시 시도]를 누르거나 홈으로 이동하세요.
            <br />
            계속되면 운영사에 문의해 주세요.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => reset()} style={{ ...btn, background: '#103355', color: '#fff' }}>
              다시 시도
            </button>
            <a href="/hub" style={{ ...btn, background: '#fff', color: '#103355' }}>
              홈으로
            </a>
          </div>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 11, color: '#777', fontFamily: 'ui-monospace, monospace' }}>오류 코드 {error.digest}</p>
          )}
          <p style={{ fontSize: 11, color: '#777' }}>이 오류는 자동으로 기록되어 담당자에게 전달됩니다.</p>
        </div>
      </body>
    </html>
  );
}
