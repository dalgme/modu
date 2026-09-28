import { NextResponse } from 'next/server';

import { safeEqual } from '@/lib/auth/secret';
import { runSmokeSeed } from '@/lib/ops/smoke-seed';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/ops/smoke-seed — 자동 화면 점검(스모크 E2E) 계정·데이터 시드 (P34-A).
 *
 * 인증: `Authorization: Bearer ${SMOKE_SEED_TOKEN}`. 환경변수가 비어 있으면 무조건 403(기능 꺼짐).
 * 비밀번호는 `SMOKE_PASSWORD` 환경변수에서 읽고 응답에는 절대 넣지 않는다.
 * 멱등 — 여러 번 호출해도 같은 결과(이미 있으면 비밀번호만 재설정). 서비스롤 전용, slug `smoke` 행사 밖은 건드리지 않는다.
 */
export async function POST(request: Request) {
  const expected = process.env.SMOKE_SEED_TOKEN;
  if (!expected) {
    return NextResponse.json({ ok: false, error: '스모크 시드가 비활성화되어 있습니다(SMOKE_SEED_TOKEN 미설정).' }, { status: 403 });
  }
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;
  if (!safeEqual(token, expected)) {
    return NextResponse.json({ ok: false, error: '인증 실패' }, { status: 401 });
  }
  const password = process.env.SMOKE_PASSWORD ?? '';
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: 'SMOKE_PASSWORD 환경변수가 없거나 8자 미만입니다.' }, { status: 500 });
  }

  try {
    const result = await runSmokeSeed(password);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : '시드 실패';
    console.error('[smoke-seed] failed', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
