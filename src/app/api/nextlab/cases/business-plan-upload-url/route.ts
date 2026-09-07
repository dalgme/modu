import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { requireNextlab } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 넥스트랩: '업체별 사업추진 계획서' 첨부파일을 브라우저에서 Supabase 스토리지로 직접 업로드하기
 * 위한 서명 URL 발급. Vercel 서버리스 요청 본문 한도(≈4.5MB)를 우회한다.
 * 업로드 후 stagingPath 를 attachBusinessPlanAction 에 전달해 케이스에 첨부한다.
 */
export async function POST(req: Request): Promise<NextResponse> {
  await requireNextlab();

  let ext = 'pdf';
  try {
    const body = (await req.json()) as { fileName?: unknown };
    const name = typeof body.fileName === 'string' ? body.fileName : '';
    const m = /\.([a-zA-Z0-9]{1,8})$/.exec(name);
    if (m) ext = m[1]!.toLowerCase();
  } catch {
    /* 본문 없으면 기본 pdf */
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
