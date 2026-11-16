import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from '@/types/database';
import { noStoreFetch } from '@/lib/supabase/no-store-fetch';

/**
 * 서버 컴포넌트·Route Handler·Server Action 용 Supabase 클라이언트.
 * 요청별 쿠키에서 세션을 읽고, anon 키 + RLS 로 접근 제어한다.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // 조회 결과를 Next.js 데이터 캐시에 담지 않는다 (no-store-fetch.ts)
      global: { fetch: noStoreFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component 에서 호출된 경우 set 이 무시된다.
            // 세션 갱신은 미들웨어(updateSession)가 담당하므로 무해하다.
          }
        },
      },
    },
  );
}
