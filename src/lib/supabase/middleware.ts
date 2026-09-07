import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from '@/types/database';

/**
 * 미들웨어에서 매 요청마다 세션을 갱신한다.
 * Supabase 인증 토큰 만료를 방지하고, 응답 쿠키를 최신 상태로 유지한다.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() 를 호출해 토큰을 검증·갱신한다.
  // 이 호출과 return 사이에 로직을 추가하면 세션 동기화 문제가 생길 수 있으므로 주의.
  await supabase.auth.getUser();

  return supabaseResponse;
}
