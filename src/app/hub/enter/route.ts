import { NextResponse } from 'next/server';

import { getRealSessionProfile, getSessionProfile } from '@/lib/auth/guards';
import { enterProgram } from '@/lib/programs/enter';

export const dynamic = 'force-dynamic';

/**
 * 허브 배너 클릭 / 로그인 자동 진입: 컨텍스트 쿠키를 쓰고 역할 홈으로 보낸다.
 * GET /hub/enter?program=<id>[&group=<id>|&all=1]
 */
export async function GET(request: Request): Promise<NextResponse> {
  // 미리 불러오기(prefetch) 요청은 쿠키를 바꾸지 않는다 — 사용자가 실제로 누른 그룹만 진입 (2026-10-29)
  const h = request.headers;
  if (h.get('next-router-prefetch') || h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')) {
    return new NextResponse(null, { status: 204 });
  }
  const url = new URL(request.url);
  const programId = url.searchParams.get('program') ?? '';
  const group = url.searchParams.get('group');
  const all = url.searchParams.get('all') === '1';

  const real = await getRealSessionProfile();
  const effective = await getSessionProfile();
  if (!real || !real.is_active || !effective) return NextResponse.redirect(new URL('/login', url));
  if (real.must_change_password) return NextResponse.redirect(new URL('/change-password', url));
  if (!programId) return NextResponse.redirect(new URL('/hub', url));

  const result = await enterProgram(real, effective, programId, group && group.length > 0 ? group : null, all);
  return NextResponse.redirect(new URL(result.redirectTo, url));
}
