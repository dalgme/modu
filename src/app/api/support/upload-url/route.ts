import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { requireRole } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 지원신청/자금신청 서류를 브라우저에서 스토리지로 직접 업로드하기 위한 서명 URL 발급.
 * 멘티 본인·담당 멘토(대리)·운영기관이 사용. 케이스 소속 검증은 첨부 액션에서 수행한다.
 * Vercel 서버리스 요청 본문 한도(≈4.5MB)를 우회한다.
 */
export async function POST(req: Request): Promise<NextResponse> {
  await requireRole(['mentee', 'mentor', 'nextlab', 'institution']);

  let ext = 'pdf';
  try {
    const body = (await req.json()) as { fileName?: unknown };
    const name = typeof body.fileName === 'string' ? body.fileName : '';
    const m = /\.([a-zA-Z0-9]{1,8})$/.exec(name);
    if (m) ext = m[1]!.toLowerCase();
  } catch {
    /* 기본 pdf */
  }

  const stagingPath = `_staging/${randomUUID()}.${ext}`;
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
