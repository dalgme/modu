import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 진흥원: 신청서 PDF 를 브라우저에서 Supabase 스토리지로 직접 업로드하기 위한 서명 URL 발급.
 * Vercel 서버리스 요청 본문 한도(≈4.5MB)를 우회하기 위해, 대용량 원본은 함수를 거치지 않고
 * 스토리지로 바로 올린다. 업로드 후 stagingPath 를 parse-application 라우트에 전달한다.
 */
export async function POST(): Promise<NextResponse> {
  await requireStaff();
  const stagingPath = `_staging/${randomUUID()}.pdf`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from('documents')
    .createSignedUploadUrl(stagingPath);
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: `업로드 URL 발급 실패: ${error?.message ?? '알 수 없는 오류'}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, path: data.path, token: data.token });
}
