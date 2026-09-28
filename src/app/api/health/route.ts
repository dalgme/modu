import { NextResponse } from 'next/server';

import { getHealth } from '@/lib/ops/health';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * 헬스 엔드포인트 (P34-B) — 인증 없음, 캐시 금지. 외부 모니터가 1~5분 간격으로 찌른다.
 * DB 핑 실패면 503, 그 외 200. 응답에 비밀값·환경변수 값은 없다(커밋 앞 7자·VERCEL_ENV 만).
 */
export async function GET() {
  const health = await getHealth();
  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
