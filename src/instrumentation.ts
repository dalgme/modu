/**
 * Next.js 서버 기동 훅 (next.config.mjs `experimental.instrumentationHook`).
 * (P35-B) 권한 거부(denyUnless) → 보안 이벤트 리스너 등록. capabilities.ts 는 클라이언트 공용 순수 모듈이라
 * 서버 전용 모듈을 import 할 수 없어, 서버 기동 시 여기서 리스너를 꽂는다. Edge 런타임(미들웨어)에서는 아무것도 하지 않는다.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installDenyListener } = await import('./lib/ops/security-events');
    installDenyListener();
  }
}
