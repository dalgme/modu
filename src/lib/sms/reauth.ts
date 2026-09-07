import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPassword } from '@/lib/auth/verify-password';

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

/**
 * 민감 작업 비밀번호 재인증 + 실패 잠금 (app_settings 카운터, 플랫폼 공통 키).
 * 문자 API 설정(§21)·멘토 지급서류 체크(§15) 등에서 공용.
 */
export async function reauthenticate(user: { id: string; email: string | null }, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const key = `reauth_lock:${user.id}`;
  const { data: lock } = await admin.from('app_settings').select('value').eq('key', key).is('program_id', null).maybeSingle();
  const state = parseState(lock?.value);
  if (state.lockedUntil && state.lockedUntil > Date.now()) {
    const min = Math.ceil((state.lockedUntil - Date.now()) / 60000);
    return { ok: false, error: `비밀번호 오류가 반복되어 ${min}분 동안 잠겼습니다.` };
  }
  if (!user.email) return { ok: false, error: '이메일이 없는 계정은 재인증할 수 없습니다.' };
  const ok = await verifyPassword(user.email, password);
  if (ok) {
    await upsert(key, JSON.stringify({ fails: 0, lockedUntil: null }));
    return { ok: true };
  }
  const fails = state.fails + 1;
  const lockedUntil = fails >= MAX_FAILS ? Date.now() + LOCK_MINUTES * 60000 : null;
  await upsert(key, JSON.stringify({ fails: lockedUntil ? 0 : fails, lockedUntil }));
  return {
    ok: false,
    error: lockedUntil ? `비밀번호 오류 ${MAX_FAILS}회로 ${LOCK_MINUTES}분 동안 잠겼습니다.` : `비밀번호가 올바르지 않습니다. (${fails}/${MAX_FAILS})`,
  };
}

function parseState(v: string | null | undefined): { fails: number; lockedUntil: number | null } {
  try {
    const p = v ? (JSON.parse(v) as { fails?: number; lockedUntil?: number | null }) : {};
    return { fails: p.fails ?? 0, lockedUntil: p.lockedUntil ?? null };
  } catch {
    return { fails: 0, lockedUntil: null };
  }
}

async function upsert(key: string, value: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from('app_settings').select('id').eq('key', key).is('program_id', null).maybeSingle();
  if (data) await admin.from('app_settings').update({ value }).eq('id', data.id);
  else await admin.from('app_settings').insert({ key, value, program_id: null });
}
