import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

/**
 * service_role 키를 사용하는 관리자 전용 클라이언트 (RLS 우회).
 *
 * ⚠️ 서버 전용. 절대 클라이언트 번들에 포함되면 안 된다.
 * 관리자 계정 발급, 초대 링크 생성 등 특권 작업에만 사용한다.
 * 이 모듈을 'use client' 파일에서 import 하면 안 된다.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
