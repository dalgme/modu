import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { generateTempPassword } from '@/lib/auth/admin-accounts';
import { safeEqual } from '@/lib/auth/secret';

/**
 * 1회용 부트스트랩: 최초 **플랫폼 관리자** 계정 생성 (역할 nextlab + is_platform_admin).
 * 셀프가입이 없으므로 배포 직후 이 라우트로 첫 관리자를 만들고, 이후 /platform 콘솔에서 행사를 개설·복제하고
 * 행사별 스태프 계정을 발급한다.
 *
 * 가드:
 *  - BOOTSTRAP_TOKEN 환경변수가 설정돼 있어야 하고 x-bootstrap-token 헤더와 일치해야 함
 *  - 이미 플랫폼 관리자가 존재하면 409 (재실행 차단, self-disable)
 *
 * 사용 후에는 BOOTSTRAP_TOKEN 을 제거할 것.
 */
export async function POST(request: Request) {
  const expected = process.env.BOOTSTRAP_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: '부트스트랩이 비활성화되어 있습니다.' }, { status: 403 });
  }
  if (!safeEqual(request.headers.get('x-bootstrap-token'), expected)) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { email?: string; name?: string; phone?: string } | null;
  if (!body?.email || !body?.name) {
    return NextResponse.json({ error: 'email, name 필요' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { count } = await admin.from('users').select('id', { count: 'exact', head: true }).eq('is_platform_admin', true);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: '이미 부트스트랩되었습니다(플랫폼 관리자 존재).' }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email: body.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: body.name },
  });
  if (error || !data.user) {
    return NextResponse.json({ error: error?.message ?? '생성 실패' }, { status: 500 });
  }

  const { error: profileError } = await admin.from('users').insert({
    id: data.user.id,
    role: 'nextlab',
    is_platform_admin: true,
    platform_role: 'owner',
    name: body.name,
    phone: body.phone ?? null,
    email: body.email,
    must_change_password: true,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // 플랫폼 통합관리자는 통합관리 전용 계정 — 행사 소속을 만들지 않는다 (행사 운영은 각 행사의 운영사 계정으로)
  const { count: programCount } = await admin.from('programs').select('id', { count: 'exact', head: true });

  await admin.from('audit_logs').insert({
    actor_id: null,
    action: 'account.bootstrap',
    entity_type: 'users',
    entity_id: data.user.id,
    metadata: { role: 'nextlab', is_platform_admin: true, platform_role: 'owner', email: body.email, programs: programCount ?? 0 },
  });

  return NextResponse.json({ email: body.email, tempPassword, userId: data.user.id, next: '/platform' });
}
