'use client';

import { useEffect, useRef } from 'react';
import { RefreshCw, Home } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * 오류 경계 공용 화면 (P34-B). 각 라우트 그룹의 error.tsx 가 scope·홈 경로만 바꿔 렌더한다.
 * 마운트 시 한 번 `POST /api/client-error` 로 보고한다(sendBeacon 우선, 실패 무시).
 * 기관명 리터럴 금지 — 문구는 역할 중립("운영사") 로만 쓴다.
 */

export interface ClientErrorPayload {
  digest?: string | null;
  message?: string | null;
  path: string;
  scope: string;
  ua?: string;
}

/** 오류 보고 전송 — 화면을 절대 막지 않는다 (예외 전부 삼킴). SafeSlot·global-error 도 이 함수를 쓴다. */
export function reportClientError(payload: ClientErrorPayload): void {
  try {
    if (typeof window === 'undefined') return;
    const body = JSON.stringify({
      digest: payload.digest ?? null,
      message: payload.message ? String(payload.message).slice(0, 300) : null,
      path: payload.path.slice(0, 200),
      scope: payload.scope.slice(0, 60),
      ua: (payload.ua ?? navigator.userAgent ?? '').slice(0, 300),
    });
    const url = '/api/client-error';
    if (typeof navigator.sendBeacon === 'function') {
      // text/plain 이면 CORS preflight 없이 바로 전송된다 (서버는 본문을 JSON 으로 파싱)
      if (navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
    }
    void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => undefined);
  } catch {
    // ignore
  }
}

export interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** 어느 경계에서 났는지 (root / nextlab / mentor / … ) — 보고·집계 키 */
  scope: string;
  /** [홈으로] 이동 경로 (전체 새로고침으로 이동해 클라이언트 상태를 버린다) */
  homeHref: string;
}

export function ErrorFallback({ error, reset, scope, homeHref }: ErrorFallbackProps) {
  const reported = useRef(false);
  useEffect(() => {
    // StrictMode 이중 effect·reset 후 재마운트에도 이 인스턴스에서는 한 번만 보고
    if (reported.current) return;
    reported.current = true;
    reportClientError({ digest: error.digest ?? null, message: error.message, path: window.location.pathname, scope });
  }, [error, scope]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-12 text-center" role="alert">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700" aria-hidden>
        <RefreshCw className="h-6 w-6" />
      </span>
      <h1 className="text-lg font-semibold">화면을 불러오지 못했습니다</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        일시적인 문제일 수 있습니다. [다시 시도]를 누르거나 홈으로 이동하세요.
        <br />
        계속되면 운영사에 문의해 주세요.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={() => reset()}>
          <RefreshCw className="h-4 w-4" /> 다시 시도
        </Button>
        <Button asChild variant="outline">
          <a href={homeHref}>
            <Home className="h-4 w-4" /> 홈으로
          </a>
        </Button>
      </div>
      {error.digest && (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          오류 코드 {error.digest}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">이 오류는 자동으로 기록되어 담당자에게 전달됩니다.</p>
    </div>
  );
}
