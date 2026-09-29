import { NextResponse } from 'next/server';

import { resolveDocAccess } from '@/lib/files/access';
import { createSignedUrl } from '@/lib/storage/files';

export const dynamic = 'force-dynamic';

/**
 * 업로드 파일 미리보기·다운로드 (2026-09-30) — 권한 확인 후 짧은 서명 URL 로 이동.
 *  - `?inline=1` : 브라우저 안에서 열기(웹 미리보기 — PDF·이미지는 그대로, Word·한글은 미리보기 창이 이 주소에서 파일을 읽어 그린다)
 *  - 기본        : 저장된 파일명(doc_name, 보고서는 "멘토명-멘티명-회차-온/오프라인")으로 다운로드
 */
export async function GET(request: Request, { params }: { params: { id: string } }): Promise<Response> {
  const access = await resolveDocAccess(params.id);
  if (!access.ok) return NextResponse.json({ error: access.status === 401 ? 'unauthorized' : access.status === 404 ? 'not_found' : 'forbidden' }, { status: access.status });
  const inline = new URL(request.url).searchParams.get('inline') === '1';
  const url = await createSignedUrl(access.doc.bucket, access.doc.path, 120, inline ? false : access.doc.name);
  if (!url) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } });
}
