/**
 * 최초 관리자(진흥원) 계정 부트스트랩.
 * 셀프가입이 없으므로 첫 institution 계정은 이 스크립트로 1회 생성한다.
 * 이후 계정은 이 계정으로 로그인해 /api/admin/users 로 발급한다.
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

const { error: profileError } = await admin.from('users').insert({
  id: data.user.id,
  role: 'institution',
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
  metadata: { role: 'institution', email },
});

console.log('✅ 부트스트랩 institution 계정 생성 완료');
console.log('  email        :', email);
console.log('  임시 비밀번호 :', password);
console.log('  user id      :', data.user.id);
console.log('  → 최초 로그인 시 비밀번호 변경이 강제됩니다.');
