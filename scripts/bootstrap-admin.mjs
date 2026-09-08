/**
 * 최초 플랫폼 관리자 계정 부트스트랩 (역할 nextlab + is_platform_admin).
 * 셀프가입이 없으므로 첫 계정은 이 스크립트(또는 /api/setup)로 1회 생성한다.
 * 이후 /platform 콘솔에서 행사를 개설하고 행사별 스태프 계정을 발급한다.
 *
 * 사용법:
 *   node --env-file=.env.local scripts/bootstrap-admin.mjs <email> <name> [phone]
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const [, , email, name, phone] = process.argv;
if (!email || !name) {
  console.error('usage: node --env-file=.env.local scripts/bootstrap-admin.mjs <email> <name> [phone]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요');
  process.exit(1);
}

function tempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const all = upper + lower + digit;
  const b = randomBytes(14);
  const pick = (s, x) => s[x % s.length];
  const chars = [pick(upper, b[0]), pick(lower, b[1]), pick(digit, b[2])];
  for (let i = 3; i < 14; i++) chars.push(pick(all, b[i]));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = b[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const password = tempPassword();

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { name },
});
if (error || !data.user) {
  console.error('auth 사용자 생성 실패:', error?.message);
  process.exit(1);
}

const { count } = await admin.from('users').select('id', { count: 'exact', head: true }).eq('is_platform_admin', true);
if ((count ?? 0) > 0) {
  console.error('이미 플랫폼 관리자가 있습니다. /platform 콘솔에서 계정을 발급하세요.');
  process.exit(1);
}

const { error: profileError } = await admin.from('users').insert({
  id: data.user.id,
  role: 'nextlab',
  is_platform_admin: true,
  platform_role: 'owner',
  name,
  phone: phone ?? null,
  email,
  must_change_password: true,
});
if (profileError) {
  await admin.auth.admin.deleteUser(data.user.id);
  console.error('프로필 생성 실패:', profileError.message);
  process.exit(1);
}

await admin.from('audit_logs').insert({
  actor_id: null,
  action: 'account.bootstrap',
  entity_type: 'users',
  entity_id: data.user.id,
  metadata: { role: 'nextlab', is_platform_admin: true, email },
});

// 통합관리 전용 계정 — 행사 소속 없음

console.log('✅ 플랫폼 관리자 계정 생성 완료 — 로그인 후 /platform 에서 행사를 개설하세요');
console.log('  email        :', email);
console.log('  임시 비밀번호 :', password);
console.log('  user id      :', data.user.id);
console.log('  → 최초 로그인 시 비밀번호 변경이 강제됩니다.');
