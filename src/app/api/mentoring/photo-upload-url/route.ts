import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { requireRole } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 멘토링 현장사진을 브라우저에서 photos 버킷으로 직접 업로드하기 위한 서명 URL 발급.
 * 담당 멘토가 사용하며, 케이스 소속·최종 기록은 일지 저장 액션에서 검증한다.
 * File 을 서버 액션으로 그대로 넘기면 저장되지 않던 문제(본문/직렬화)를 우회한다.
 */
export async function POST(req: Request): Promise<NextResponse> {
  await requireRole(['mentor']);

  let ext = 'jpg';
  try {
    const body = (await req.json()) as { fileName?: unknown };
    const name = typeof body.fileName === 'string' ? body.fileName : '';
    const m = /\.([a-zA-Z0-9]{1,8})$/.exec(name);
    if (m) ext = m[1]!.toLowerCase();
  } catch {
    /* 기본 jpg */
  }

  const stagingPath = `_staging/${randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from('photos').createSignedUploadUrl(stagingPath);
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: `업로드 URL 발급 실패: ${error?.message ?? '알 수 없는 오류'}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, path: data.path, token: data.token });
}
