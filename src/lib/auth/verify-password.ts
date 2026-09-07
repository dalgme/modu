import 'server-only';

import { createClient as createSbClient } from '@supabase/supabase-js';

/**
 * 현재 사용자의 로그인 비밀번호가 맞는지 확인한다.
 * 세션(쿠키)에 영향을 주지 않도록 persistSession=false 인 임시 클라이언트로 검증한다.
 * (민감 작업 재확인용 — 예: 멘토링 일지 삭제)
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  if (!email || !password) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  const client = createSbClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  return !error && !!data?.session;
}
