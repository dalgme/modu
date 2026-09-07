import { NextResponse } from 'next/server';

import { getRealSessionProfile } from '@/lib/auth/guards';
import { createAccountSchema } from '@/lib/validations/auth';
import { createStaffOrMentorAccount } from '@/lib/auth/admin-accounts';

/**
 * 관리자 계정 발급 (진흥원/넥스트랩/멘토).
 * 권한: 넥스트랩(총괄관리자)은 institution/nextlab/mentor 발급, 진흥원은 mentor 만 발급.
 * 서버에서 역할 재검증 (클라이언트 UI 숨김에 의존하지 않음).
 * 계정 발급은 스태프 특권이므로 대행 여부와 무관하게 '실제 신원'으로 판정한다.
 */
export async function POST(request: Request) {
  const profile = await getRealSessionProfile();
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  if (profile.role !== 'institution' && profile.role !== 'nextlab') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' },
      { status: 400 },
    );
  }

  // 진흥원은 멘토 계정만 발급 가능 (넥스트랩 총괄관리자만 전 역할 발급)
  if (profile.role === 'institution' && parsed.data.role !== 'mentor') {
    return NextResponse.json(
      { error: '진흥원은 멘토 계정만 발급할 수 있습니다.' },
      { status: 403 },
    );
  }

  try {
    const result = await createStaffOrMentorAccount({
      ...parsed.data,
      actorId: profile.id,
    });
    return NextResponse.json({
      userId: result.userId,
      email: result.email,
      tempPassword: result.tempPassword,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '계정 발급에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
