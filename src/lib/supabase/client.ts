import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/types/database';

/**
 * 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트.
 * anon 키만 사용하며, RLS 로 접근 제어된다. service_role 키는 절대 사용 금지.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
